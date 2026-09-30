import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const env = {
  DATABASE_URL: "file:e2e.db",
  ADMIN_PASSWORD: "e2e-password",
  SESSION_SECRET: "e2e-session-secret-at-least-16",
  PUBLIC_BASE_URL: `http://localhost:${PORT}`,
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
  webServer: {
    // Fresh DB each run; requires `npm run build` first.
    command: `rm -f e2e.db && npm run db:migrate && npm run db:seed && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/about`,
    env,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
