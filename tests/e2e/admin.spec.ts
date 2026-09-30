import { expect, test, type Page } from "@playwright/test";

// Runs before smoke/v1 (alphabetical). Every test that changes settings restores the defaults,
// because the later specs assume the out-of-the-box rules.

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

async function resetDefaults(page: Page) {
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: /Reset everything to defaults/ }).click();
  await page.getByRole("button", { name: "Yes, reset" }).click();
  await expect(page.getByText("Everything is back to the defaults.")).toBeVisible();
}

test("dashboard summarizes the room and lists machines needing attention", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Reports · 24h")).toBeVisible();
  await expect(page.getByRole("img", { name: /Reports per day/ })).toBeVisible();
  const attention = page.getByRole("table", { name: "Machines needing attention" });
  await expect(attention.getByRole("row", { name: /Dryer 3.*Broken: No heat/ })).toBeVisible();
  await expect(attention.getByRole("row", { name: /Dryer 4.*Dries worse than room-mates/ })).toBeVisible();
  await expect(page.getByRole("table", { name: "Rooms overview" }).getByRole("row", { name: /Laundry room/ })).toBeVisible();
});

test("settings change live behavior: site name, banner, and the reports-needed-for-Broken rule", async ({ page, context }) => {
  await login(page);

  // An isolated washer so later specs' seed expectations are untouched.
  await page.goto("/admin/rooms");
  await page.getByRole("link", { name: /Laundry room/ }).first().click();
  await page.getByLabel("Kind").selectOption("washer");
  await page.getByLabel("Label prefix").fill("Washer");
  await page.getByLabel("From #").fill("9");
  await page.getByLabel("To #").fill("9");
  await page.getByRole("button", { name: "Add machines" }).click();
  await expect(page.getByText("Added 1 washer.")).toBeVisible();
  const href = await page.getByRole("link", { name: /^\/m\// }).last().getAttribute("href");
  expect(href).toMatch(/^\/m\/[a-z0-9]+$/);

  try {
    await page.goto("/admin/settings");
    await page.getByLabel("Reports needed to mark Broken").fill("2");
    await page.getByLabel("Site name").fill("Summit Wash");
    await page.getByLabel("Announcement banner").fill("Room closed Friday for vent cleaning");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved 3 changes" })).toBeVisible();

    // A resident (fresh browser context) sees the new name + banner, and one report no longer means Broken.
    const resident = await context.browser()!.newContext({ baseURL: "http://localhost:3100", viewport: { width: 390, height: 800 } });
    const p = await resident.newPage();
    await p.goto(`${href}?r=1`);
    await expect(p.getByRole("link", { name: /Summit Wash/ })).toBeVisible();
    await expect(p.getByText("Room closed Friday for vent cleaning")).toBeVisible();
    await p.waitForTimeout(900);
    const sheet = p.getByRole("dialog");
    await sheet.getByRole("radio", { name: /Didn't work/ }).click();
    await sheet.getByRole("button", { name: "Won't start" }).click();
    await sheet.getByRole("button", { name: "Submit report" }).click();
    const status = p.getByRole("region", { name: "Status" });
    await expect(status.getByText("Caution")).toBeVisible();
    await expect(status.getByText("Reported broken, not yet confirmed")).toBeVisible();

    // A second, different device confirms it.
    const resident2 = await context.browser()!.newContext({ baseURL: "http://localhost:3100", viewport: { width: 390, height: 800 } });
    const p2 = await resident2.newPage();
    await p2.goto(`${href}?r=1`);
    await p2.waitForTimeout(900);
    await p2.getByRole("dialog").getByRole("radio", { name: /Didn't work/ }).click();
    await p2.getByRole("dialog").getByRole("button", { name: "Won't start" }).click();
    await p2.getByRole("dialog").getByRole("button", { name: "Submit report" }).click();
    await expect(p2.getByRole("region", { name: "Status" }).getByText("Broken", { exact: true })).toBeVisible();
    await resident.close();
    await resident2.close();
  } finally {
    await resetDefaults(page);
  }

  // The change and the reset are both in the activity log.
  await page.goto("/admin/audit");
  await expect(page.getByRole("row", { name: /Changed settings.*brokenMinReporters: 1 → 2/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Reset settings to defaults/ })).toBeVisible();
});

test("settings validate input and show per-field errors", async ({ page }) => {
  await login(page);
  await page.goto("/admin/settings");
  // Bypass the browser's own min/max check to exercise the server-side validation.
  await page.locator("form", { has: page.getByRole("button", { name: "Save changes" }) }).evaluate((f) => f.setAttribute("novalidate", ""));
  await page.getByLabel("Report window").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "from 14 to 365" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Some values need fixing." })).toBeVisible();
});

test("per-room dryer settings limit what residents can report and get recommended", async ({ page, context }) => {
  await login(page);
  await page.goto("/admin/rooms");
  await page.getByRole("link", { name: /Laundry room/ }).first().click();
  await page.waitForURL(/\/admin\/rooms\/[a-z0-9]+$/);
  const roomUrl = page.url();

  const setOffered = async (offered: string[]) => {
    await page.goto(roomUrl);
    for (const s of ["Delicates", "No heat", "Low", "Medium", "High"]) {
      const box = page.getByRole("checkbox", { name: new RegExp(`^${s}`) });
      if ((await box.isChecked()) !== offered.includes(s)) await box.setChecked(offered.includes(s));
    }
    await page.getByRole("button", { name: "Save room" }).click();
    await expect(page.getByText("Room saved.")).toBeVisible();
  };

  try {
    await setOffered(["Low", "Medium"]);
    const resident = await context.browser()!.newContext({ baseURL: "http://localhost:3100", viewport: { width: 390, height: 800 } });
    const p = await resident.newPage();
    await p.goto("/m/hsd1?r=1");
    await p.getByRole("dialog").getByRole("radio", { name: /^Dry/ }).first().click();
    const radios = p.getByRole("dialog").getByRole("radiogroup", { name: "Setting" }).getByRole("radio");
    await expect(radios).toHaveText(["Med", "Low"]);
    await p.keyboard.press("Escape");
    // The ladder on the machine page only lists what the room offers.
    const ladder = p.getByRole("table", { name: "Reports per dryer setting" });
    await expect(ladder.locator("tbody tr")).toHaveCount(2);
    await resident.close();
  } finally {
    await setOffered(["Delicates", "No heat", "Low", "Medium", "High"]);
  }
});

test("reports can be searched, hidden, unhidden and exported; export needs admin", async ({ page, playwright, baseURL }) => {
  await login(page);
  await page.goto("/admin/reports?q=Gym+shorts");
  const row = page.getByRole("row", { name: /Gym shorts came out shiny/ });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: /^Hide report/ }).click();
  await expect(page.getByText("No reports match these filters.")).toBeVisible();

  await page.goto("/admin/reports?q=Gym+shorts&state=hidden");
  const hidden = page.getByRole("row", { name: /Gym shorts came out shiny/ });
  await expect(hidden.getByText("Hidden")).toBeVisible();
  await hidden.getByRole("button", { name: /^Unhide report/ }).click();
  await page.goto("/admin/reports?q=Gym+shorts");
  await expect(page.getByRole("row", { name: /Gym shorts came out shiny/ })).toHaveCount(1);

  const csv = await page.request.get("/admin/reports/export?range=all");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body.split("\r\n")[0]).toContain("time_utc,building,room,machine");
  expect(body).toContain("Gym shorts came out shiny");

  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get("/admin/reports/export")).status()).toBe(401);
  await anon.dispose();
});

test("admin pages redirect to login when signed out", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  const p = await ctx.newPage();
  for (const path of ["/admin", "/admin/rooms", "/admin/reports", "/admin/settings", "/admin/audit"]) {
    await p.goto(path);
    await expect(p).toHaveURL(/\/admin\/login/);
  }
  await ctx.close();
});

test("admin pages don't scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await login(page);
  for (const path of ["/admin", "/admin/rooms", "/admin/reports", "/admin/settings", "/admin/audit"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
  await page.goto("/admin/rooms");
  await page.getByRole("link", { name: /Laundry room/ }).first().click();
  await page.waitForURL(/\/admin\/rooms\/[a-z0-9]+$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("health endpoint reports the database is up and migrated, and leaks nothing else", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
