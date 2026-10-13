import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicOrigin, PUBLIC_SUBDOMAINS } from "@pawl/config";
import { escapeHtml } from "@pawl/core";
import { registryFor } from "@pawl/registry";
import { initRegistryFromDisk, readManifest } from "@pawl/registry/node";
import { sharedFavicon } from "@pawl/vite-config";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { headersFile } from "./src/csp";
import { EFFECTIVE, contactAddress } from "./src/legal-facts";
import { renderCabinet, renderReceiptMachine } from "./src/cabinet";
import { openingTicker } from "./src/ticker";

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
  const year = String(new Date().getFullYear());
  const rootHost = new URL(rootOrigin).host;
  const back = encodeURIComponent(rootOrigin);
  const vars: Record<string, string> = {
    ROOT_ORIGIN: rootOrigin,
    ROOT_HOST: escapeHtml(rootHost),
    PASS_HREF: passHref,
    PASS_HOST: escapeHtml(new URL(passHref).host),
    PASS_SIGNIN_HREF: `${passHref}/?returnTo=${back}`,
    PASS_REGISTER_HREF: `${passHref}/?mode=register&amp;returnTo=${back}`,
    YEAR: year,
    EFFECTIVE: EFFECTIVE,
    CONTACT_EMAIL: escapeHtml(contactAddress(rootHost)),
    SITE_NAME: siteName,
    SITE_NAME_UPPER: escapeHtml(view.site.name.toUpperCase()),
    MACHINE: renderCabinet({
      siteName: view.site.name,
      rootOrigin,
      passHref,
      bays: view.bays,
      ticker: openingTicker(view.site.name, view.bays.length),
    }),
    MACHINE_PRIVACY: renderReceiptMachine({
      siteName: view.site.name,
      rootOrigin,
      title: "Privacy policy",
    }),
    MACHINE_TERMS: renderReceiptMachine({
      siteName: view.site.name,
      rootOrigin,
      title: "Terms of service",
    }),
  };
  return {
    name: "html-vars",
    transformIndexHtml(html) {
      return html.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
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
  return {
    plugins: [
      htmlVars(rootOrigin, passHref, view),
      sharedFavicon(),
      securityHeaders(env.VITE_PASS_ORIGIN ?? passHref),
    ],
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
