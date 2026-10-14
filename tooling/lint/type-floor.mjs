import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const THEME = resolve(root, "packages/ui/src/theme.css");
const ROOTS = ["apps/web", "apps/pass", "packages/ui/src"];
const ROOT_PX = 16;
const FLOOR_REM = 0.68;
const FLOOR_PX = FLOOR_REM * ROOT_PX;
const SKIP_DIRECTORIES = ["node_modules", "dist", ".turbo", ".wrangler"];
const KEYWORDS = new Set([
  "inherit",
  "initial",
  "revert",
  "revert-layer",
  "unset",
]);

const theme = readFileSync(THEME, "utf8");
const MACHINE_UNIT_MIN_PX = Number(
  /--u:\s*clamp\(\s*(\d*\.?\d+)px/.exec(theme)[1],
);
const TOKENS = new Map(
  [...theme.matchAll(/(--(?:pw-fs|text)-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(
    (match) => [match[1], match[2].trim()],
  ),
);

function collect(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.includes(entry.name)) continue;
      collect(path, found);
      continue;
    }
    if (/\.test\./.test(entry.name) || entry.name === "page-css.ts") continue;
    if (/\.(css|html|tsx?)$/.test(entry.name)) found.push(path);
  }
  return found;
}

function resolveLength(raw) {
  const value = raw.trim();
  const largest = /^max\((.+)\)$/i.exec(value);
  if (largest !== null) {
    const sizes = largest[1]
      .split(/,(?![^(]*\))/)
      .map((part) => resolveLength(part));
    return sizes.includes(null) ? null : Math.max(...sizes);
  }
  const spacing = /^--spacing\(\s*(\d*\.?\d+)\s*\)$/.exec(value);
  if (spacing !== null) return Number(spacing[1]) * MACHINE_UNIT_MIN_PX;
  const machine = /^calc\(\s*(\d*\.?\d+)\s*\*\s*var\(--u\)\s*\)$/.exec(value);
  if (machine !== null) return Number(machine[1]) * MACHINE_UNIT_MIN_PX;
  const token = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
  if (token !== null) {
    const named = TOKENS.get(token[1]);
    return named === undefined ? null : resolveLength(named);
  }
  const clamped = /^clamp\(\s*([^,]+),/i.exec(value);
  const literal = clamped === null ? value : clamped[1].trim();
  const match = /^(\d*\.?\d+)(rem|em|px)$/.exec(literal);
  if (match === null) return null;
  const size = Number(match[1]);
  return match[2] === "px" ? size : size * ROOT_PX;
}

function sizeOfShorthand(value) {
  for (const part of value.split(/\s+/)) {
    const head = part.split("/")[0];
    if (/^--spacing\(|^calc\(|^\d*\.?\d+(rem|em|px)$/.test(head)) return head;
  }
  return null;
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

function sizes(source, isCss) {
  const found = [];
  const declaration = isCss
    ? /(?<![-\w])(font-size|font)\s*:\s*([^;}"']+)/gi
    : /\[(font-size|font):([^\]\s"'`]+)\]/g;
  for (const match of source.matchAll(declaration)) {
    const value = match[2].replaceAll("_", " ").trim().replace(/\s+/g, " ");
    found.push({
      property: match[1].toLowerCase(),
      value,
      line: lineOf(source, match.index),
    });
  }
  if (isCss) return found;
  for (const match of source.matchAll(/(?<![\w-])text-\[([^\]\s"'`]+)\]/g)) {
    const value = match[1].replace(/^length:/, "").replaceAll("_", " ");
    if (/^(color:|#|rgb|hsl|var\(--pw-(?!fs-))/.test(value)) continue;
    found.push({
      property: "font-size",
      value,
      line: lineOf(source, match.index),
    });
  }
  for (const match of source.matchAll(
    /(?<![\w-])text-([a-z0-9-]+)(?![\w[-])/g,
  )) {
    const token = `--text-${match[1]}`;
    if (!TOKENS.has(token)) continue;
    found.push({
      property: "font-size",
      value: `var(${token})`,
      line: lineOf(source, match.index),
    });
  }
  return found;
}

const offences = [];
for (const name of ROOTS) {
  for (const file of collect(resolve(root, name))) {
    const where = relative(root, file).split("\\").join("/");
    const source = readFileSync(file, "utf8");
    for (const { property, value, line } of sizes(
      source,
      /\.(css|html)$/.test(file),
    )) {
      const token = property === "font-size" ? value : sizeOfShorthand(value);
      if (property === "font" && token === null) {
        if (KEYWORDS.has(value.toLowerCase())) continue;
        offences.push({
          where,
          line,
          value,
          why: "font shorthand with no readable size",
        });
        continue;
      }
      if (KEYWORDS.has(token.toLowerCase())) continue;
      const px = resolveLength(token);
      if (px === null) {
        offences.push({ where, line, value, why: "not statically resolvable" });
        continue;
      }
      if (px < FLOOR_PX) {
        offences.push({
          where,
          line,
          value,
          why: `${px.toFixed(2)}px, below the ${FLOOR_PX}px floor`,
        });
      }
    }
  }
}

if (offences.length > 0) {
  console.error(
    `Type below the ${FLOOR_REM}rem floor, or too indirect to check:`,
  );
  for (const offence of offences) {
    console.error(
      `  ${offence.where}:${offence.line}  ${offence.value}\n      ${offence.why}`,
    );
  }
  console.error(
    `\nThe label role sits at ${FLOOR_REM}rem and nothing is smaller. A size\n` +
      `this guard cannot resolve is reported rather than passed, so\n` +
      `indirection cannot hide a value under the floor.\n`,
  );
  process.exit(1);
}

console.log(`type floor: clean, nothing under ${FLOOR_REM}rem`);
