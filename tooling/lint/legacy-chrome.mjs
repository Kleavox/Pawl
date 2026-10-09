import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["apps", "packages"];
const EXTENSIONS = [".ts", ".tsx", ".css", ".html"];
const BANNED = ["pw-title", "pw-kicker", "pw-product-"];

const offences = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(path);
      continue;
    }
    if (!EXTENSIONS.some((extension) => entry.name.endsWith(extension)))
      continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const banned of BANNED) {
        if (line.includes(banned)) {
          offences.push(
            `${relative(process.cwd(), path)}:${index + 1}  ${banned}`,
          );
        }
      }
    });
  }
}

for (const root of ROOTS) walk(root);

if (offences.length > 0) {
  console.error("Legacy chrome still present:");
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}

console.log("legacy-chrome: clean");
