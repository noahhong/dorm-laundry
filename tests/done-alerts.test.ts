import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DONE_STALE_MS, doneAlertAction, donePayload } from "../src/lib/push-rules";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification: (...args: unknown[]) => sendNotification(...args) } }));

const M = 60_000;
const NOW = Date.UTC(2026, 9, 7, 18, 0);

describe("doneAlertAction", () => {
  it("waits until the estimate, then sends", () => {
    expect(doneAlertAction({ endsAt: NOW + M, endedAt: null }, NOW)).toBe("wait");
    expect(doneAlertAction({ endsAt: NOW, endedAt: null }, NOW)).toBe("send");
    expect(doneAlertAction({ endsAt: NOW - DONE_STALE_MS, endedAt: null }, NOW)).toBe("send");
  });

  it("drops alerts for stopped, reported or replaced runs, and for loads that finished long ago", () => {
    expect(doneAlertAction({ endsAt: NOW + 10 * M, endedAt: NOW - M }, NOW)).toBe("drop");
    expect(doneAlertAction({ endsAt: NOW - DONE_STALE_MS - 1, endedAt: null }, NOW)).toBe("drop");
  });
});

describe("donePayload", () => {
  it("tells washers to move to a dryer and dryers to grab the clothes", () => {
    expect(donePayload({ code: "hsw1", label: "Washer 1", kind: "washer", roomName: "Laundry room" })).toEqual({
      title: "Washer 1 should be done",
      body: "Laundry room: time to move your clothes to a dryer so the next person can use it.",
      url: "/m/hsw1",
      tag: "done-hsw1",
    });
    expect(donePayload({ code: "hsd1", label: "Dryer 1", kind: "dryer", roomName: "Laundry room" }).body).toContain("grab your clothes");
  });
});

describe("sendDueRunAlerts", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dl-done-"));
  let db: import("../src/lib/db").DB;
  let schema: typeof import("../src/lib/db/schema");
  let sendDueRunAlerts: typeof import("../src/lib/run-alerts").sendDueRunAlerts;

  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", `file:${path.join(dir, "test.db")}`);
    vi.stubEnv("VAPID_PUBLIC_KEY", "test-public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
    const { getDb } = await import("../src/lib/db");
    const { migrate } = await import("drizzle-orm/libsql/migrator");
    db = getDb();
    await migrate(db, { migrationsFolder: "drizzle" });
    schema = await import("../src/lib/db/schema");
    ({ sendDueRunAlerts } = await import("../src/lib/run-alerts"));
    await db.insert(schema.buildings).values({ id: "b", slug: "b", name: "B", createdAt: NOW });
    await db.insert(schema.rooms).values({ id: "r", buildingId: "b", slug: "r", name: "Laundry room", createdAt: NOW });
    await db.insert(schema.machines).values({ id: "w1", roomId: "r", code: "hsw1", kind: "washer", label: "Washer 1", createdAt: NOW });
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await db.delete(schema.machineRuns);
  });

  async function run(id: string, endsAt: number, endedAt: number | null = null, alert = true) {
    await db.insert(schema.machineRuns).values({
      id,
      machineId: "w1",
      startedAt: endsAt - 35 * M,
      endsAt,
      endedAt,
      deviceHash: "d",
      ipHash: "i",
      ...(alert ? { alertEndpoint: `https://fcm.googleapis.com/fcm/send/${id}`, alertP256dh: "B".repeat(87), alertAuth: "a".repeat(22) } : {}),
    });
  }
  const alertsLeft = async () => (await db.select().from(schema.machineRuns)).filter((r) => r.alertEndpoint != null).map((r) => r.id).sort();

  it("sends one push per finished timer and forgets the subscription", async () => {
    await run("due", NOW - M);
    await run("later", NOW + 10 * M);
    await run("no-alert", NOW - M, null, false);
    expect(await sendDueRunAlerts(NOW)).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [target, payload, opts] = sendNotification.mock.calls[0];
    expect(target.endpoint).toBe("https://fcm.googleapis.com/fcm/send/due");
    expect(JSON.parse(payload)).toMatchObject({ title: "Washer 1 should be done", url: "/m/hsw1" });
    expect(opts.TTL).toBe(30 * 60);
    expect(await alertsLeft()).toEqual(["later"]);
    // A second sweep sends nothing more.
    expect(await sendDueRunAlerts(NOW)).toBe(0);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("drops alerts for ended runs and stale ones without sending", async () => {
    await run("stopped", NOW + 10 * M, NOW - M);
    await run("stale", NOW - DONE_STALE_MS - M);
    expect(await sendDueRunAlerts(NOW)).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
    expect(await alertsLeft()).toEqual([]);
  });

  it("does nothing when push isn't set up", async () => {
    await run("due", NOW - M);
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    try {
      expect(await sendDueRunAlerts(NOW)).toBe(0);
      expect(await alertsLeft()).toEqual(["due"]);
    } finally {
      vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
    }
  });
});
