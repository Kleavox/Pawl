import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const src = resolve(import.meta.dirname, "../src");
const target = resolve(src, "page-css.ts");
const require = createRequire(import.meta.url);
const cliPackage = require.resolve("@tailwindcss/cli/package.json");
const cli = resolve(
  dirname(cliPackage),
  JSON.parse(readFileSync(cliPackage, "utf8")).bin.tailwindcss,
);

export function pageInput() {
  return readFileSync(resolve(src, "theme.css"), "utf8")
    .replace(/^@source .*\n/gm, "")
    .replace(
      '@import "tailwindcss/utilities.css" layer(utilities);',
      '@import "tailwindcss/utilities.css" layer(utilities) source(none);\n@source "./machine";\n@source "./pages";\n@source not "./**/*.test.*";',
    );
}

export function compilePageCss() {
  return execFileSync(process.execPath, [cli, "-i", "-", "--minify"], {
    cwd: src,
    input: pageInput(),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  }).trim();
}

if (process.argv[1] === import.meta.filename) {
  writeFileSync(
    target,
    `export const PAGE_CSS =\n  ${JSON.stringify(compilePageCss())};\n`,
  );
}
