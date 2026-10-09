import { resolve } from "node:path";
import { getPublicOrigin, PUBLIC_SUBDOMAINS } from "@pawl/config";
import { sharedFavicon } from "@pawl/vite-config";
import { defineConfig, loadEnv, type Plugin } from "vite";

function htmlVars(rootOrigin: string): Plugin {
  const passHref = getPublicOrigin(rootOrigin, PUBLIC_SUBDOMAINS.pass);
  const vars: Record<string, string> = {
    ROOT_ORIGIN: rootOrigin,
    ROOT_HOST: new URL(rootOrigin).host,
    LINK_HREF: getPublicOrigin(rootOrigin, PUBLIC_SUBDOMAINS.link),
    PASS_HREF: passHref,
    PORT_HREF: getPublicOrigin(rootOrigin, PUBLIC_SUBDOMAINS.portfolio),
    PASS_SIGNIN_HREF: `${passHref}/?returnTo=${encodeURIComponent(rootOrigin)}`,
    YEAR: String(new Date().getFullYear()),
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
  return {
    plugins: [htmlVars(rootOrigin), sharedFavicon()],
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
