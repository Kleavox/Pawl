import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";

const SLOT = "<!--app-->";
const SSR_DIR = "dist-ssr";

export function injectApp(template: string, html: string): string {
  if (!template.includes(SLOT)) {
    throw new Error(`The page template has no ${SLOT} slot.`);
  }
  return template.replace(SLOT, () => html);
}

export function prerenderPages(options: {
  entry: string;
  pages: Record<string, string>;
}): Plugin {
  return {
    name: "prerender-pages",
    config() {
      return {
        environments: {
          ssr: {
            build: {
              outDir: SSR_DIR,
              emptyOutDir: true,
              rollupOptions: { input: { prerender: options.entry } },
            },
          },
        },
        builder: {
          async buildApp(builder) {
            const { ssr, client } = builder.environments;
            if (ssr === undefined || client === undefined) {
              throw new Error(
                "The prerender step needs a client and an ssr build.",
              );
            }
            await builder.build(ssr);
            await builder.build(client);
            const root = builder.config.root;
            const module = (await import(
              pathToFileURL(resolve(root, SSR_DIR, "prerender.js")).href
            )) as { render: (page: string) => string };
            for (const [file, page] of Object.entries(options.pages)) {
              const path = resolve(root, "dist", file);
              writeFileSync(
                path,
                injectApp(readFileSync(path, "utf8"), module.render(page)),
              );
            }
            rmSync(resolve(root, SSR_DIR), { recursive: true, force: true });
          },
        },
      };
    },
  };
}
