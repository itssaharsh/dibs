import { defineConfig } from "@playwright/test";

// e2e runs against fixtures (?state=) — no chain needed. BASE_URL overrides the local dev server.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000" },
  webServer: process.env.BASE_URL ? undefined : { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
