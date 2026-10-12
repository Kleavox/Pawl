import { defineConfig } from "@playwright/test";
import { LOCAL_WORKER_PORTS, localWorkerOrigin } from "@pawl/topology";

const reuse = !process.env.CI;

function fixture(key: string, port: number) {
  return {
    command: `pnpm exec wrangler dev --config fixture/${key}.jsonc --port ${port}`,
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: reuse,
    timeout: 90_000,
  };
}

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  maxFailures: process.env.CI ? 5 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: localWorkerOrigin("gateway"),
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `pnpm exec wrangler dev --config ../../.wrangler/local/pawl.json --port ${LOCAL_WORKER_PORTS.gateway} --persist-to ../../worker/.wrangler/state`,
      url: `${localWorkerOrigin("gateway")}/health`,
      reuseExistingServer: reuse,
      timeout: 90_000,
    },
    {
      command: `pnpm exec wrangler dev --config ../dev/wrangler.jsonc --port ${LOCAL_WORKER_PORTS.pass}`,
      url: `${localWorkerOrigin("pass")}/health`,
      reuseExistingServer: reuse,
      timeout: 90_000,
    },
    fixture("notes", 8790),
    fixture("docs", 8791),
    fixture("monitor", 8792),
  ],
});
