import { expect, test } from "@playwright/test";

test("theme toggle cycles Auto → Light → Dark and persists across reloads", async ({ page }) => {
  await page.goto("/about");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
  await page.getByRole("button", { name: /^Theme: Auto/ }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: /^Theme: Light/ }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(11, 13, 16)");
  await page.getByRole("button", { name: /^Theme: Dark/ }).click();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
});

test("web app manifest and icons are served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  expect((await request.get("/apple-icon")).status()).toBe(200);
});

test("a dryer with no reports borrows the room's consensus setting", async ({ page }) => {
  await page.goto("/m/hsd5");
  const best = page.getByRole("region", { name: "Best setting" });
  await expect(best.getByText("Try Medium")).toBeVisible();
  await expect(best.getByText(/No reports for this dryer yet\. The other \d dryers here range Low–High/)).toBeVisible();
});

test("a dryer that dries much worse than its room-mates is flagged with a WASH service link", async ({ page }) => {
  await page.goto("/m/hsd4");
  const banner = page.getByRole("region", { name: "Dries worse than the other dryers here" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link", { name: /Report to WASH/ })).toHaveAttribute("href", /wash\.com\/service-request/);
  await page.goto("/m/hsd1");
  await expect(page.getByText("Dries worse than the other dryers here")).toBeHidden();
  await page.goto("/b/hedrick-summit/laundry");
  await expect(page.getByRole("link", { name: /^Dryer 4, .*/ })).toContainText("Weak heat");
});

test("undo doesn't reset the per-machine rate limit", async ({ page }) => {
  await page.goto("/m/hsw1?r=1");
  await page.waitForTimeout(900);
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: /Worked fine/ }).click();
  await sheet.getByRole("button", { name: "Submit report" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status").getByText("Report removed.")).toBeVisible();

  await page.getByRole("button", { name: "Report how it went" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("dialog").getByRole("radio", { name: /Worked fine/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("just reported");
});

// Keep this test last: it locks the (shared, localhost) test IP out of admin login for 15 minutes.
test("admin login locks out an IP after repeated wrong passwords", async ({ page }) => {
  await page.goto("/admin/login");
  const attempt = async (password: string) => {
    await page.getByLabel("Password").fill(password);
    const done = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/login"));
    await page.getByRole("button", { name: "Log in" }).click();
    await done;
  };
  for (let i = 0; i < 5; i++) await attempt(`wrong-password-${i}`);
  await expect(page.locator("form").getByRole("alert")).toContainText("Wrong password");
  await attempt("e2e-password"); // correct, but the IP is now locked out
  await expect(page.locator("form").getByRole("alert")).toContainText("Too many wrong passwords");
});

test("load picker tailors the setting to the fabrics and pre-fills the report", async ({ page }) => {
  await page.goto("/m/hsd6");
  const load = page.getByRole("region", { name: "What's in your load?" });
  await load.getByRole("button", { name: "Wool & sweaters" }).click();
  const advice = load.getByTestId("load-advice");
  await expect(advice).toContainText("Use No heat for this load");
  await expect(advice).toContainText("Wool is safest dried flat on a rack");

  // Picks are remembered on the phone and carried to other machines and into the report.
  await page.goto("/m/hsw4");
  await load.getByRole("button", { name: "Wool & sweaters" }).click(); // off
  await load.getByRole("button", { name: "Towels & bedding" }).click();
  await expect(load.getByTestId("load-advice")).toContainText("Use Hot water for this load");

  await page.getByRole("button", { name: "Report how it went" }).click();
  await page.waitForTimeout(900);
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: /Worked fine/ }).click();
  await expect(sheet.getByText(/Your load \(Towels & bedding\) is/)).toBeVisible();
  await sheet.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("status").getByText(/report saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Recent reports" }).getByText("Towels & bedding")).toBeVisible();
});
