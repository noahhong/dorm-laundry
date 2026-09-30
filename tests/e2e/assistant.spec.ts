import { expect, test } from "@playwright/test";

// The Claude API is replaced by tests/e2e/mock-anthropic.mjs, which asks for plan_load and echoes the best dryer.
test("the laundry helper turns clothes into a working machine and setting from the site's rules", async ({ page }) => {
  // Dryer 3 is broken, so the helper should send the resident elsewhere.
  await page.goto("/m/hsd3");
  const helper = page.getByRole("region", { name: "Ask the laundry helper" });
  await helper.getByLabel("What are you washing?").fill("my gym leggings");
  await helper.getByRole("button", { name: "Ask" }).click();

  const chat = helper.getByTestId("helper-chat");
  await expect(chat.getByText(/^Use Dryer \d on Low\.$/)).toBeVisible();
  const dryerLink = chat.getByRole("link", { name: /Dryer \d · Low/ });
  await expect(dryerLink).toBeVisible();
  await expect(dryerLink).not.toHaveAttribute("href", "/m/hsd3");
  await expect(chat.getByRole("link", { name: /Washer \d · Cold water/ })).toBeVisible();

  // The helper's reading of the load fills in "What's in your load?" too.
  await expect(page.getByRole("button", { name: "Athletic / stretch" })).toHaveAttribute("aria-pressed", "true");
});

test("the laundry helper shows on the room page", async ({ page }) => {
  await page.goto("/b/hedrick-summit/laundry");
  await expect(page.getByRole("region", { name: "Ask the laundry helper" })).toBeVisible();
});
