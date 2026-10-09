import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { EMPTY_MANIFEST, initRegistrySync } from "./index.js";

let ready = false;

export function initRegistryFromDisk(): void {
  if (ready) return;
  initRegistrySync(
    readFileSync(new URL("../pkg/registry_bg.wasm", import.meta.url)),
  );
  ready = true;
}

export function readManifest(root: string): string {
  const fromEnv = process.env.ESTATE_MANIFEST?.trim();
  if (fromEnv) return fromEnv;
  const file = join(root, "estate.json");
  return existsSync(file) ? readFileSync(file, "utf8") : EMPTY_MANIFEST;
}
