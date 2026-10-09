import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const APPS = ["web"];
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

function collect(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.includes(entry.name)) continue;
      collect(path, found);
      continue;
    }
    if (/\.(css|html)$/.test(entry.name)) found.push(path);
  }
  return found;
}

function resolveLength(value) {
  const clamped = /^clamp\(\s*([^,]+),/i.exec(value);
  const literal = clamped === null ? value : clamped[1].trim();
  const match = /^(\d*\.?\d+)(rem|em|px)$/.exec(literal);
  if (match === null) return null;
  const size = Number(match[1]);
  return match[2] === "px" ? size : size * ROOT_PX;
}

function sizeTokenOfShorthand(value) {
  for (const part of value.split(/\s+/)) {
    const head = part.split("/")[0];
    if (/^\d*\.?\d+(rem|em|px)$/.test(head)) return head;
  }
  return null;
}

function declarations(source) {
  const found = [];
  for (const match of source.matchAll(
    /(?<![-\w])(font-size|font)\s*:\s*([^;}"']+)/gi,
  )) {
    found.push({
      property: match[1].toLowerCase(),
      value: match[2].trim().replace(/\s+/g, " "),
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return found;
}

const offences = [];
for (const app of APPS) {
  for (const file of collect(resolve(root, "apps", app))) {
    const where = relative(root, file).split("\\").join("/");
    const source = readFileSync(file, "utf8");
    for (const { property, value, line } of declarations(source)) {
      const token =
        property === "font-size" ? value : sizeTokenOfShorthand(value);

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
    `\nTHEME.md sets the label role at ${FLOOR_REM}rem and defines nothing\n` +
      `smaller. A size this guard cannot resolve is reported rather than\n` +
      `passed, so indirection cannot hide a value under the floor.\n`,
  );
  process.exit(1);
}

console.log(`type floor: clean, nothing under ${FLOOR_REM}rem`);
