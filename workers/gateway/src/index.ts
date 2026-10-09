import { withInitRegistry } from "@pawl/registry";
import registryWasm from "@pawl/registry/pkg/registry_bg.wasm";

import app from "./app";

export default {
  fetch: withInitRegistry(registryWasm, app),
};
