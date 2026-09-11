import { defineConfig, devices } from "@playwright/test";

const appUrl = "http://127.0.0.1:3100";
const runtimeUrl = "http://127.0.0.1:4100";
const sharedEnv = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://deliveryos:deliveryos@127.0.0.1:5434/deliveryos",
  REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    "local-development-secret-at-least-32-characters",
  BETTER_AUTH_URL: appUrl,
  NEXT_PUBLIC_APP_URL: appUrl,
  NEXT_PUBLIC_RUNTIME_URL: runtimeUrl,
  SIMULATION_CREDENTIAL_SECRET:
    process.env.SIMULATION_CREDENTIAL_SECRET ??
    "local-simulation-secret-at-least-32-characters",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: appUrl,
    ...(!process.env.CI
      ? {
          launchOptions: {
            executablePath:
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          },
        }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @deliveryos/web start --port 3100",
      env: sharedEnv,
      url: appUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @deliveryos/runtime start",
      env: { ...sharedEnv, PORT: "4100", WEB_ORIGIN: appUrl },
      url: `${runtimeUrl}/health/ready`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
