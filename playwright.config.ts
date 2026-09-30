import { defineConfig, devices } from "@playwright/test";
import webpush from "web-push";

const PORT = 3100;
const MOCK_PORT = 3101;
// Throwaway VAPID keys so the "notify me when it's fixed" UI is on during e2e.
const vapid = webpush.generateVAPIDKeys();
const env = {
  DATABASE_URL: "file:e2e.db",
  ADMIN_PASSWORD: "e2e-password",
  SESSION_SECRET: "e2e-session-secret-at-least-32-characters-long",
  PUBLIC_BASE_URL: `http://localhost:${PORT}`,
  // The laundry helper talks to a local stand-in for the Claude API (tests/e2e/mock-anthropic.mjs). No
  // ANTHROPIC_API_KEY here: tests/e2e/assistant.spec.ts saves one through admin Settings first.
  ANTHROPIC_BASE_URL: `http://localhost:${MOCK_PORT}`,
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["iPhone 13"],
    browserName: "chromium",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  webServer: [
    {
      command: "node tests/e2e/mock-anthropic.mjs",
      url: `http://localhost:${MOCK_PORT}`,
      env: { MOCK_ANTHROPIC_PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
    },
    {
      // Fresh DB each run; requires `npm run build` first.
      command: `rm -f e2e.db && npm run db:migrate && npm run db:seed && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/about`,
      env,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
