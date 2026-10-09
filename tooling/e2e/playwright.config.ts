import { defineConfig } from "@playwright/test";
import { LOCAL_WORKER_PORTS, localWorkerOrigin } from "@pawl/topology";

import { WORKER_SOURCE } from "./repos.mjs";

const reuse = !process.env.CI;

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: localWorkerOrigin("gateway"),
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `pnpm exec wrangler dev --config ../../workers/pass/wrangler.jsonc --port ${LOCAL_WORKER_PORTS.pass}`,
      url: `${localWorkerOrigin("pass")}/health`,
      reuseExistingServer: reuse,
      timeout: 90_000,
    },
    {
      command: `pnpm exec wrangler dev --config worker/wrangler.jsonc --port ${LOCAL_WORKER_PORTS.link}`,
      cwd: WORKER_SOURCE.link,
      url: `${localWorkerOrigin("link")}/health`,
      reuseExistingServer: reuse,
      timeout: 90_000,
    },
    {
      command: `pnpm exec wrangler dev --config ../../workers/gateway/wrangler.jsonc --port ${LOCAL_WORKER_PORTS.gateway}`,
      url: `${localWorkerOrigin("gateway")}/health`,
      reuseExistingServer: reuse,
      timeout: 90_000,
    },
  ],
});
