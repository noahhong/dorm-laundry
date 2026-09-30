import { expect, test } from "@playwright/test";

test("home redirects to the only room, which shows machine cards", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/b\/hedrick-summit\/laundry$/);
  await expect(page.getByRole("heading", { name: "Laundry room" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Dryer 3, Broken: No heat/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Dryer 2, Caution.*recommended Low/ })).toBeVisible();
  // Filter to washers hides dryers.
  await page.getByRole("radio", { name: "Washers" }).click();
  await expect(page.getByRole("link", { name: /^Dryer 1/ })).toBeHidden();
  await expect(page.getByRole("link", { name: /^Washer 1/ })).toBeVisible();
});

test("machine page shows status, recommendation and recent reports", async ({ page }) => {
  await page.goto("/m/hsd2");
  await expect(page.getByRole("heading", { name: "Dryer 2" })).toBeVisible();
  await expect(page.getByText("Avoid Medium: runs hot")).toBeVisible();
  await expect(page.getByRole("region", { name: "Recent reports" }).getByText(/Melted the print/)).toBeVisible();
});

test("3-tap report from a QR link updates the machine", async ({ page }) => {
  await page.goto("/m/hsd5?r=1");
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /Dryer 5: how'd it go\?/ })).toBeVisible();
  await page.waitForTimeout(900); // anti-bot minimum time-to-submit
  await sheet.getByRole("radio", { name: /Dry/ }).first().click(); // tap 1
  await sheet.getByRole("radio", { name: "Low" }).click(); // tap 2
  await sheet.getByRole("button", { name: "Submit report" }).click(); // tap 3
  await expect(page.getByRole("status").getByText(/report saved/)).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("region", { name: "Status" }).getByText("Works")).toBeVisible();
  await expect(page.getByRole("region", { name: "Recent reports" }).getByText("Low · Dry")).toBeVisible();

  // Undo removes it again.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status").getByText("Report removed.")).toBeVisible();
  await expect(page.getByText("No reports in the last 60 days.")).toBeVisible();
});

test("reporting a broken washer with symptoms", async ({ page }) => {
  await page.goto("/m/hsw4");
  await page.getByRole("button", { name: "Report how it went" }).click();
  const sheet = page.getByRole("dialog");
  await page.waitForTimeout(900);
  await sheet.getByRole("radio", { name: /Didn't work/ }).click();
  await sheet.getByRole("button", { name: "Won't drain" }).click();
  await sheet.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("region", { name: "Status" }).getByText("Broken")).toBeVisible();
  await expect(page.getByRole("region", { name: "Status" }).getByText("Won't drain")).toBeVisible();

  // Rate limit: an immediate second report on the same machine is refused.
  await page.getByRole("button", { name: "Report how it went" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("dialog").getByRole("radio", { name: /Worked fine/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("just reported");
});

test("admin can add machines and print QR codes", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await page.getByRole("link", { name: /Laundry room/ }).click();

  await page.getByLabel("Kind").selectOption("dryer");
  await page.getByLabel("From #").fill("7");
  await page.getByLabel("To #").fill("8");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added 2 dryers.")).toBeVisible();
  await expect(page.getByText("Dryer 8", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Out of order" }).first().click();
  await expect(page.getByRole("button", { name: "Clear out-of-order" }).first()).toBeVisible();

  await page.getByRole("link", { name: /Print QR sheet/ }).click();
  await expect(page.getByRole("heading", { name: "QR stickers" })).toBeVisible();
  await expect(page.locator("li svg path").first()).toBeAttached();
  await expect(page.getByText("Dryer 8")).toBeVisible();
  await expect(page.getByText(/localhost:3100\/m\/hsd1\?r=1/)).toBeAttached();
});
