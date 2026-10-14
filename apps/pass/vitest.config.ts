import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __PASS__: JSON.stringify({
      siteName: "Fixture",
      rootOrigin: "https://example.test",
    }),
  },
  test: {
    environment: "jsdom",
    testTimeout: 20_000,
    setupFiles: ["./src/test-setup.ts"],
  },
});
