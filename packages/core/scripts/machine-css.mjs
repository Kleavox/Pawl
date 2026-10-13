import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ui = fileURLToPath(new URL("../../ui/src/", import.meta.url));
const target = fileURLToPath(new URL("../src/machine-css.ts", import.meta.url));

export function machineCss() {
  const styles = readFileSync(`${ui}styles.css`, "utf8");
  const tokens = styles.slice(0, styles.indexOf("\n}\n") + 3);
  return `${tokens}\n${readFileSync(`${ui}machine.css`, "utf8")}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(
    target,
    `export const MACHINE_CSS =\n  ${JSON.stringify(machineCss())};\n`,
  );
}
