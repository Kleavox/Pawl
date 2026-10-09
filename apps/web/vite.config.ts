import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicOrigin, PUBLIC_SUBDOMAINS } from "@pawl/config";
import { escapeHtml } from "@pawl/core";
import { registryFor } from "@pawl/registry";
import { initRegistryFromDisk, readManifest } from "@pawl/registry/node";
import { sharedFavicon } from "@pawl/vite-config";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { renderShelves } from "./src/shelves";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function siteView(rootOrigin: string, passHref: string) {
  initRegistryFromDisk();
  return registryFor(readManifest(repoRoot)).publicView(rootOrigin, passHref);
}

function htmlVars(
  rootOrigin: string,
  passHref: string,
  view: ReturnType<typeof siteView>,
): Plugin {
  const siteName = escapeHtml(view.site.name);
  const vars: Record<string, string> = {
    ROOT_ORIGIN: rootOrigin,
    ROOT_HOST: new URL(rootOrigin).host,
    PASS_HREF: passHref,
    PASS_SIGNIN_HREF: `${passHref}/?returnTo=${encodeURIComponent(rootOrigin)}`,
    YEAR: String(new Date().getFullYear()),
    SITE_NAME: siteName,
    SITE_NAME_UPPER: escapeHtml(view.site.name.toUpperCase()),
    SHELVES: renderShelves(view.bays),
    FOOTER_LINKS: view.footer
      .map(
        (link) =>
          `<a href="${escapeHtml(link.href)}">${escapeHtml(link.title)}</a>`,
      )
      .join("\n          "),
  };
  return {
    name: "html-vars",
    transformIndexHtml(html) {
      return html.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const rootOrigin = env.PUBLIC_ROOT_ORIGIN ?? "https://example.com";
  const passHref = getPublicOrigin(rootOrigin, PUBLIC_SUBDOMAINS.pass);
  const view = siteView(rootOrigin, passHref);
  return {
    plugins: [htmlVars(rootOrigin, passHref, view), sharedFavicon()],
    define: { __SITE__: JSON.stringify(view) },
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
