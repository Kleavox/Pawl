import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __SITE__: "null",
    __PAGE__: "null",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
