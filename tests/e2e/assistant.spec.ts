import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

// Runs first in this file: the helper stays hidden until an admin saves a working key in Settings.
test("an admin saves the laundry helper's API key in Settings, and the key is never shown again", async ({ page }) => {
  await page.goto("/m/hsd3");
  await expect(page.getByRole("region", { name: "Ask the laundry helper" })).toHaveCount(0);

  await login(page);
  await page.goto("/admin/settings");
  const card = page.getByRole("region", { name: "Laundry helper API key" });
  await expect(card.getByText("No key")).toBeVisible();

  await card.getByLabel("Anthropic API key").fill("not-a-key");
  await card.getByRole("button", { name: "Save key" }).click();
  await expect(card.getByText(/doesn't look like an Anthropic API key/)).toBeVisible();

  // The stand-in API rejects keys containing "bad", like a revoked key: nothing is saved.
  await card.getByLabel("Anthropic API key").fill("sk-ant-bad-0000000000000000000000");
  await card.getByRole("button", { name: "Save key" }).click();
  await expect(card.getByText("Anthropic rejected this key. Nothing was saved.")).toBeVisible();

  const key = "sk-ant-e2e-good-key-1234567890abcdWXYZ";
  await card.getByLabel("Anthropic API key").fill(key);
  await card.getByRole("button", { name: "Save key" }).click();
  await expect(card.getByText("Key saved and working.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(card.getByText("Key ending …WXYZ")).toBeVisible();
  expect(await page.content()).not.toContain(key);
  await card.getByRole("button", { name: "Test key" }).click();
  await expect(card.getByText("The key works.")).toBeVisible();

  // Resetting the rules keeps the key.
  await page.getByRole("button", { name: /Reset everything to defaults/ }).click();
  await page.getByRole("button", { name: "Yes, reset" }).click();
  await expect(page.getByText("Everything is back to the defaults.")).toBeVisible();
  await page.reload();
  await expect(card.getByText("Key ending …WXYZ")).toBeVisible();

  await page.goto("/m/hsd3");
  await expect(page.getByRole("region", { name: "Ask the laundry helper" })).toBeVisible();
});

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
