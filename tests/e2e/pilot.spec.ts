import { expect, test } from "@playwright/test";

test("room page shows when it's usually busy, from past timers", async ({ page }) => {
  await page.goto("/b/hedrick-summit/laundry");
  const busy = page.getByRole("region", { name: "When is it busy?" });
  await expect(busy).toBeVisible();
  await expect(busy.getByRole("radio", { name: "Today" })).toHaveAttribute("aria-checked", "true");
  await busy.getByRole("radio", { name: "Sat" }).or(busy.getByRole("radio", { name: "Sun" })).first().click();
  await expect(busy.getByRole("list", { name: /Busy hours, (Saturday|Sunday)/ })).toBeVisible();
  await expect(busy.getByRole("listitem", { name: /^8pm: / })).toBeVisible();
});

test("residents can say 'Same here' on someone else's report, and take it back", async ({ page }) => {
  await page.goto("/m/hsd2");
  const report = page.getByRole("region", { name: "Recent reports" }).getByRole("listitem").filter({ hasText: "Melted the print" });
  const same = report.getByRole("button", { name: /^Same here/ });
  await same.click();
  await expect(same).toHaveAttribute("aria-pressed", "true");
  await expect(same).toHaveText("Same here· 1");
  await expect(same).toBeEnabled(); // saved
  // Survives a reload: it's stored, not just on screen.
  await page.reload();
  await expect(report.getByRole("button", { name: /^Same here/ })).toHaveAttribute("aria-pressed", "true");
  await report.getByRole("button", { name: /^Same here/ }).click();
  await expect(report.getByRole("button", { name: /^Same here/ })).toHaveAttribute("aria-pressed", "false");
  await expect(report.getByRole("button", { name: /^Same here/ })).toBeEnabled();
  await expect(report.getByRole("button", { name: /^Same here/ })).toHaveText("Same here");
});

test("the load picker takes thickness and carries it into the report", async ({ page }) => {
  await page.goto("/m/hsd1");
  const load = page.getByRole("region", { name: "What's in your load?" });
  await load.getByRole("button", { name: "Everyday cotton" }).click();
  await load.getByRole("button", { name: /^Thick/ }).click();
  await expect(load.getByTestId("load-advice")).toContainText("Thick items take longer");

  await page.getByRole("button", { name: "Report how it went" }).click();
  await page.waitForTimeout(900);
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: /^Dry/ }).click();
  await expect(sheet.getByText(/Your load \(Thick · Everyday cotton\) is/)).toBeVisible();
  // Clean up so later tests start with an empty load.
  await page.keyboard.press("Escape");
  await load.getByRole("button", { name: "Clear" }).click();
});
