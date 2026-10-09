import { readFileSync } from "node:fs";

import { initOidcSync } from "./index.js";

export function initOidcFromDisk(): void {
  initOidcSync(readFileSync(new URL("../pkg/oidc_bg.wasm", import.meta.url)));
}
