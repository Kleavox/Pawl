import { fileURLToPath } from "node:url";
import { registryFor } from "@pawl/registry";
import { initRegistryFromDisk, readManifest } from "@pawl/registry/node";
import { reactApp } from "@pawl/vite-config";

import { machineShell } from "./src/machine";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

initRegistryFromDisk();
const site = registryFor(readManifest(repoRoot)).publicView(
  process.env.VITE_ROOT_ORIGIN ?? "https://example.com",
  process.env.VITE_PASS_ORIGIN ?? "https://paw.example.com",
);

const rootOrigin = process.env.VITE_ROOT_ORIGIN ?? "https://example.com";

export default reactApp({
  plugins: [
    {
      name: "machine-shell",
      transformIndexHtml(html) {
        return html.replace("{{MACHINE}}", () =>
          machineShell(site.site.name, rootOrigin),
        );
      },
    },
  ],
});
