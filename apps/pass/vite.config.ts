import { fileURLToPath } from "node:url";
import { registryFor } from "@pawl/registry";
import { initRegistryFromDisk, readManifest } from "@pawl/registry/node";
import { reactApp } from "@pawl/vite-config";
import { prerenderPages } from "@pawl/vite-config/prerender";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const rootOrigin = process.env.VITE_ROOT_ORIGIN ?? "https://example.com";

initRegistryFromDisk();
const site = registryFor(readManifest(repoRoot)).publicView(
  rootOrigin,
  process.env.VITE_PASS_ORIGIN ?? "https://paw.example.com",
);

export default reactApp({
  plugins: [
    prerenderPages({
      entry: "src/prerender.tsx",
      pages: { "index.html": "pass" },
    }),
  ],
  define: {
    __PASS__: JSON.stringify({ siteName: site.site.name, rootOrigin }),
  },
});
