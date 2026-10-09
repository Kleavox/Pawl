import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OLD = ["kle", "avox"].join("");
const SHORT = ["k", "vx"].join("");
const PATTERN = new RegExp(`${OLD}|\\b${SHORT}\\b`, "iu");
const FROZEN_FILE = "packages/crypto/src/index.ts";
const FROZEN_LINE = new RegExp(
  `^const HKDF_(MK|AUTH|SEAL)_INFO = new TextEncoder\\(\\)\\.encode\\("${OLD}/(mk|auth|seal)/v1"\\);$`,
  "u",
);

export function findLegacyNames(root, files) {
  const hits = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/u);
    const count = lines.filter(
      (line) =>
        PATTERN.test(line) &&
        !(file === FROZEN_FILE && FROZEN_LINE.test(line.trim())),
    ).length;
    if (count > 0) hits.push({ file, count });
  }
  return hits;
}

function repoFiles(root) {
  const listed = execSync(
    "git -c safe.directory=* ls-files --cached --others --exclude-standard",
    { cwd: root, encoding: "utf8" },
  );
  return listed.split("\n").filter(Boolean);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const hits = findLegacyNames(root, repoFiles(root));
  if (hits.length === 0) {
    console.log("legacy-name: clean");
  } else {
    for (const hit of hits) console.error(`${hit.file}: ${hit.count}`);
    console.error(
      `legacy-name: ${hits.length} file(s) still carry the old name`,
    );
    process.exitCode = 1;
  }
}
