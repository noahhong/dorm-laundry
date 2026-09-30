import { expect, test } from "@playwright/test";

// Headless Chromium can't reach a real push service, so the browser's PushManager is faked with an FCM-shaped
// subscription. Everything else is real: the service worker, the permission prompt, the server actions and DB.
// (The server then logs "web push failed: Public key is not valid" for the fake key; that is expected.)
test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["notifications"]);
  await context.addInitScript(() => {
    const KEY = "e2e:fakePushSub";
    const fake = (stored: { endpoint: string; key: number[] }) => ({
      endpoint: stored.endpoint,
      options: { applicationServerKey: new Uint8Array(stored.key).buffer },
      toJSON: () => ({ endpoint: stored.endpoint, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } }),
      unsubscribe: async () => {
        localStorage.removeItem(KEY);
        return true;
      },
    });
    PushManager.prototype.getSubscription = async function () {
      const raw = localStorage.getItem(KEY);
      return (raw ? fake(JSON.parse(raw)) : null) as unknown as PushSubscription;
    };
    PushManager.prototype.subscribe = async function (opts?: PushSubscriptionOptionsInit) {
      const stored = { endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${Math.random().toString(36).slice(2)}`, key: [...new Uint8Array(opts!.applicationServerKey as ArrayBuffer)] };
      localStorage.setItem(KEY, JSON.stringify(stored));
      return fake(stored) as unknown as PushSubscription;
    };
  });
});

test("only broken machines offer a fixed alert", async ({ page }) => {
  await page.goto("/m/hsd1");
  await expect(page.getByRole("region", { name: "Status" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Notify me when it's fixed" })).toHaveCount(0);
});

test("a resident asks to be told when a broken washer is fixed, and an admin's Mark fixed clears the wait", async ({ page, browser }) => {
  await page.goto("/m/hsw2");
  await expect(page.getByRole("region", { name: "Status" }).getByText("Broken", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Notify me when it's fixed" }).click();
  await expect(page.getByRole("heading", { name: "We'll let you know" })).toBeVisible();
  await expect(page.getByText("You'll get one notification when Washer 2 works again.")).toBeVisible();

  // Remembered across reloads (the server knows this browser is waiting), and cancellable.
  await page.reload();
  await expect(page.getByRole("button", { name: "Cancel notification" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel notification" }).click();
  await expect(page.getByRole("button", { name: "Notify me when it's fixed" })).toBeEnabled();
  await page.getByRole("button", { name: "Notify me when it's fixed" }).click();
  await expect(page.getByRole("button", { name: "Cancel notification" })).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await admin.goto("/admin/login");
  await admin.getByLabel("Password").fill("e2e-password");
  await admin.getByRole("button", { name: "Log in" }).click();
  await admin.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Rooms & machines" }).click();
  await admin.getByRole("link", { name: /Laundry room/ }).first().click();
  const washer2 = admin.getByRole("list", { name: "Machines" }).getByRole("listitem").filter({ has: admin.getByText("Washer 2", { exact: true }) });
  await expect(washer2).toContainText("1 waiting to hear it's fixed");
  await washer2.getByRole("button", { name: "Mark fixed" }).click();
  // The push is sent after the response and the one-shot watch is then removed.
  await expect(async () => {
    await admin.reload();
    await expect(washer2).not.toContainText("waiting to hear it's fixed");
  }).toPass({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByRole("region", { name: "Status" }).getByText("Broken", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Notify me when it's fixed|Cancel notification/ })).toHaveCount(0);
});

test("the service worker is served fresh", async ({ request }) => {
  const res = await request.get("/sw.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-cache");
  expect(await res.text()).toContain("notificationclick");
});
