import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const SRC_BUDGET = { pass: 0, web: 0 };
const HTML_BUDGET = { pass: 5, web: 0 };
const EXTENSIONS = [".css", ".ts", ".tsx", ".js", ".jsx", ".html", ".mjs"];

const tokens = new Set(
  [
    ...readFileSync(
      resolve(root, "packages/ui/src/styles.css"),
      "utf8",
    ).matchAll(/--(?:pw|dt)-[a-z0-9-]+:\s*(#[0-9a-fA-F]{3,8})\s*;/g),
  ].map((match) => expand(match[1])),
);

function expand(hex) {
  if (hex.length === 9) {
    return hex.toLowerCase();
  }
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex.slice(0, 7);
  return full.toLowerCase();
}

function scanForHex(filePath) {
  const found = [];
  const source = readFileSync(filePath, "utf8");
  for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    if (tokens.has(expand(match[0]))) continue;
    found.push(
      `${relative(root, filePath).split("\\").join("/")}:${
        source.slice(0, match.index).split("\n").length
      }  ${match[0]}`,
    );
  }
  return found;
}

function offPaletteSrc(app) {
  const base = resolve(root, "apps", app, "src");
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "dist"].includes(entry.name)) continue;
        walk(path);
        continue;
      }
      if (!EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        continue;
      }
      found.push(...scanForHex(path));
    }
  };
  walk(base);
  return found;
}

function offPaletteHtml(app) {
  const appDir = resolve(root, "apps", app);
  const found = [];
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) {
      const filePath = resolve(appDir, entry.name);
      found.push(...scanForHex(filePath));
    }
  }
  return found;
}

let failed = false;
for (const [app, budget] of Object.entries(SRC_BUDGET)) {
  const offences = offPaletteSrc(app);
  if (offences.length > budget) {
    failed = true;
    console.error(
      `${app}/src: ${offences.length} off-palette colours, budget ${budget}`,
    );
    for (const offence of offences) console.error(`  ${offence}`);
  }
}

for (const [app, budget] of Object.entries(HTML_BUDGET)) {
  const offences = offPaletteHtml(app);
  if (offences.length > budget) {
    failed = true;
    console.error(
      `${app}/html: ${offences.length} off-palette colours, budget ${budget}`,
    );
    for (const offence of offences) console.error(`  ${offence}`);
  }
}

if (failed) process.exit(1);
console.log("palette: clean");
