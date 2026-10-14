import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicOrigin, PUBLIC_SUBDOMAINS } from "@pawl/config";
import { escapeHtml } from "@pawl/core";
import { registryFor } from "@pawl/registry";
import { initRegistryFromDisk, readManifest } from "@pawl/registry/node";
import { reactPlugins } from "@pawl/vite-config";
import { prerenderPages } from "@pawl/vite-config/prerender";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { headersFile } from "./src/csp";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function siteView(rootOrigin: string, passHref: string) {
  initRegistryFromDisk();
  return registryFor(readManifest(repoRoot)).publicView(rootOrigin, passHref);
}

function headVars(siteName: string): Plugin {
  return {
    name: "head-vars",
    transformIndexHtml(html) {
      return html.replaceAll("{{SITE_NAME}}", escapeHtml(siteName));
    },
  };
}

function securityHeaders(passOrigin: string): Plugin {
  return {
    name: "security-headers",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: headersFile(passOrigin),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const rootOrigin = env.PUBLIC_ROOT_ORIGIN ?? "https://example.com";
  const passHref = getPublicOrigin(rootOrigin, PUBLIC_SUBDOMAINS.pass);
  const view = siteView(rootOrigin, passHref);
  const page = {
    passHref,
    rootHost: new URL(rootOrigin).host,
    passHost: new URL(passHref).host,
  };
  return {
    plugins: [
      ...reactPlugins(),
      headVars(view.site.name),
      securityHeaders(env.VITE_PASS_ORIGIN ?? passHref),
      prerenderPages({
        entry: "src/prerender.tsx",
        pages: {
          "index.html": "cabinet",
          "privacy.html": "privacy",
          "terms.html": "terms",
        },
      }),
    ],
    define: {
      __SITE__: JSON.stringify(view),
      __PAGE__: JSON.stringify(page),
    },
    build: {
      assetsInlineLimit: 0,
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, "index.html"),
          privacy: resolve(import.meta.dirname, "privacy.html"),
          terms: resolve(import.meta.dirname, "terms.html"),
        },
      },
    },
  };
});
