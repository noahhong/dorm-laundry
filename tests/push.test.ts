import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { canWatch, fixedPayload, isAllowedPushEndpoint, isFixed, pushSubscriptionSchema } from "../src/lib/push-rules";

vi.mock("server-only", () => ({}));
const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification: (...args: unknown[]) => sendNotification(...args) } }));

const sub = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
});

describe("push endpoints", () => {
  it("accepts the browsers' push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://web.push.apple.com/QK1n",
      "https://db5p.notify.windows.com/w/?token=x",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("rejects anything the server shouldn't POST to", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilpush.apple.com.example/x",
      "https://localhost/x",
      "https://169.254.169.254/latest/meta-data",
      "not a url",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });

  it("validates the subscription's keys", () => {
    expect(pushSubscriptionSchema.safeParse(sub("https://fcm.googleapis.com/fcm/send/x")).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ ...sub("https://fcm.googleapis.com/fcm/send/x"), keys: { p256dh: "short", auth: "a".repeat(22) } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse(sub("https://example.com/push")).success).toBe(false);
  });
});

describe("what counts as fixed", () => {
  it("only Broken machines can be watched", () => {
    expect(canWatch("broken")).toBe(true);
    for (const l of ["works", "caution", "unknown"] as const) expect(canWatch(l)).toBe(false);
  });
  it("reports alone: works, or no remaining evidence; mixed reports keep people waiting", () => {
    expect(isFixed("works")).toBe(true);
    expect(isFixed("unknown")).toBe(true);
    expect(isFixed("caution")).toBe(false);
    expect(isFixed("broken")).toBe(false);
  });
  it("the notification says which machine, where, and links to it", () => {
    expect(fixedPayload({ code: "hsd3", label: "Dryer 3", roomName: "Laundry room" }, "admin")).toEqual({
      title: "Dryer 3 is working again",
      body: "Laundry room: a room admin marked it fixed. Tap for its status.",
      url: "/m/hsd3",
      tag: "fixed-hsd3",
    });
  });
});

describe("notifyIfFixed", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dl-push-"));
  let db: import("../src/lib/db").DB;
  let schema: typeof import("../src/lib/db/schema");
  let notifyIfFixed: typeof import("../src/lib/push").notifyIfFixed;
  const H = 3600_000;

  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", `file:${path.join(dir, "test.db")}`);
    vi.stubEnv("SESSION_SECRET", "x".repeat(40));
    vi.stubEnv("VAPID_PUBLIC_KEY", "test-public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
    vi.stubEnv("PUBLIC_BASE_URL", "https://laundry.example.com");
    const { getDb } = await import("../src/lib/db");
    const { migrate } = await import("drizzle-orm/libsql/migrator");
    db = getDb();
    await migrate(db, { migrationsFolder: "drizzle" });
    schema = await import("../src/lib/db/schema");
    ({ notifyIfFixed } = await import("../src/lib/push"));
    const now = Date.now();
    await db.insert(schema.buildings).values({ id: "b", slug: "b", name: "B", createdAt: now });
    await db.insert(schema.rooms).values({ id: "r", buildingId: "b", slug: "r", name: "Laundry room", createdAt: now });
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(() => {
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  async function brokenMachine(id: string) {
    const now = Date.now();
    await db.insert(schema.machines).values({ id, roomId: "r", code: id, kind: "dryer", label: `Dryer ${id}`, createdAt: now });
    await db.insert(schema.reports).values({ id: `${id}-r1`, machineId: id, createdAt: now - H, outcome: "not_working", symptoms: ["no_heat"], deviceHash: "d1", ipHash: "i" });
    for (const n of [1, 2]) {
      await db.insert(schema.pushSubscriptions).values({
        id: `${id}-s${n}`,
        machineId: id,
        endpoint: `https://fcm.googleapis.com/fcm/send/${id}-${n}`,
        p256dh: "B".repeat(87),
        auth: "a".repeat(22),
        deviceHash: `w${n}`,
        createdAt: now,
      });
    }
  }
  const watchers = async (id: string) => (await db.select().from(schema.pushSubscriptions)).filter((s) => s.machineId === id).length;

  it("waits while residents' reports still say Broken", async () => {
    await brokenMachine("m1");
    expect(await notifyIfFixed("m1")).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
    expect(await watchers("m1")).toBe(2);
  });

  it("notifies everyone once residents' reports clear it, then forgets them", async () => {
    await brokenMachine("m2");
    const works = (id: string, device: string) =>
      db.insert(schema.reports).values({ id, machineId: "m2", createdAt: Date.now(), outcome: "dry", setting: "medium", symptoms: [], deviceHash: device, ipHash: "i" });
    // One "works" against one "broken" is only mixed (Caution): keep waiting.
    await works("m2-r2", "d2");
    expect(await notifyIfFixed("m2")).toBe(0);
    expect(await watchers("m2")).toBe(2);
    // A second person agrees: Works.
    await works("m2-r3", "d3");
    expect(await notifyIfFixed("m2")).toBe(2);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [target, payload, opts] = sendNotification.mock.calls[0];
    expect(target.endpoint).toMatch(/^https:\/\/fcm\.googleapis\.com/);
    expect(JSON.parse(payload)).toMatchObject({ title: "Dryer m2 is working again", url: "/m/m2" });
    expect(opts.vapidDetails).toMatchObject({ subject: "https://laundry.example.com", publicKey: "test-public", privateKey: "test-private" });
    expect(await watchers("m2")).toBe(0);
    // A second call has nobody left to tell.
    expect(await notifyIfFixed("m2")).toBe(0);
  });

  it("an admin's Mark fixed always notifies, and dead subscriptions don't break the rest", async () => {
    await brokenMachine("m3");
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    expect(await notifyIfFixed("m3", { force: true })).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sendNotification.mock.calls[0][1]).body).toContain("a room admin marked it fixed");
    expect(await watchers("m3")).toBe(0);
  });

  it("does nothing when push isn't configured", async () => {
    await brokenMachine("m4");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await notifyIfFixed("m4", { force: true })).toBe(0);
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
    expect(sendNotification).not.toHaveBeenCalled();
    expect(await watchers("m4")).toBe(2);
  });
});
