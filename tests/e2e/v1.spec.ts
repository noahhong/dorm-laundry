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
