import { defineConfig, devices } from "@playwright/test"

// E2E config. Requires a running dev server with a reachable DATABASE_URL:
//   pnpm dev              # in one shell (needs DATABASE_URL + admin session)
//   npx playwright install chromium
//   npx playwright test   # in another
//
// BASE_URL overrides the target (e.g. a preview deploy). ADMIN_STORAGE_STATE
// points at a saved logged-in storage state for /admin routes.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    storageState: process.env.ADMIN_STORAGE_STATE || undefined,
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone SE"] } }, // 375x667
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
})
