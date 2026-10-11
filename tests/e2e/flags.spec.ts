import { expect, test, type Browser } from "@playwright/test";

const NOTE = "Clothes were dripping, had to run it again";

async function flagFromNewPhone(browser: Browser, reason: string, { hides = false } = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/m/hsw3");
  const report = page.getByRole("region", { name: "Recent reports" }).getByRole("listitem").filter({ hasText: NOTE });
  await report.getByRole("button", { name: "Flag this report" }).click();
  await report.getByRole("group", { name: "What's wrong with this report?" }).getByRole("button", { name: reason }).click();
  // The flag that reaches the threshold hides the report right away, for the flagger too.
  if (hides) await expect(report).toHaveCount(0);
  else await expect(report.getByText("Flagged. Thanks, an admin will take a look.")).toBeVisible();
  await ctx.close();
}

test("residents flag a report, enough flags hide it, and an admin keeps it from the Flagged queue", async ({ page, browser }) => {
  // One flag: recorded, remembered, and undoable; the report stays up.
  await page.goto("/m/hsw3");
  const report = page.getByRole("region", { name: "Recent reports" }).getByRole("listitem").filter({ hasText: NOTE });
  await report.getByRole("button", { name: "Flag this report" }).click();
  await report.getByRole("button", { name: "Spam or fake" }).click();
  await expect(report.getByText("Flagged. Thanks, an admin will take a look.")).toBeVisible();
  await page.reload();
  await expect(report.getByText("Flagged. Thanks, an admin will take a look.")).toBeVisible();
  await report.getByRole("button", { name: "Undo" }).click();
  await expect(report.getByRole("button", { name: "Flag this report" })).toBeVisible();

  // Three different phones (the default "Flags that hide a report") take it down.
  await flagFromNewPhone(browser, "Spam or fake");
  await flagFromNewPhone(browser, "Spam or fake");
  await flagFromNewPhone(browser, "Wrong machine or not true", { hides: true });
  await page.reload();
  await expect(page.getByRole("region", { name: "Recent reports" })).not.toContainText(NOTE);

  // Its own client IP: v1.spec's lockout test may already have locked localhost out of admin login.
  const admin = await (await browser.newContext({ extraHTTPHeaders: { "x-real-ip": "10.9.8.6" } })).newPage();
  await admin.goto("/admin/login");
  await admin.getByLabel("Password").fill("e2e-password");
  await admin.getByRole("button", { name: "Log in" }).click();
  await admin.getByRole("link", { name: "1 flagged report needs a look" }).click();
  const row = admin.getByRole("table", { name: "Reports" }).getByRole("row").filter({ hasText: NOTE });
  await expect(row).toContainText("Spam or fake ×2 · Wrong machine or not true");
  await expect(row).toContainText("Hidden");
  await row.getByRole("button", { name: "Keep report on Washer 3" }).click();
  await expect(admin.getByText("No reports match these filters.")).toBeVisible();
  await admin.goto("/admin/audit");
  await expect(admin.getByText("Kept a flagged report")).toBeVisible();
  await expect(admin.getByText("Residents' flags hid a report")).toBeVisible();

  // Back on the machine page, and the old flags don't count any more.
  await page.reload();
  await expect(page.getByRole("region", { name: "Recent reports" })).toContainText(NOTE);
});
