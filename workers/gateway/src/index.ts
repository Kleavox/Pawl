import { withInitOidc } from "@pawl/oidc";
import oidcWasm from "@pawl/oidc/pkg/oidc_bg.wasm";
import { withInitRegistry } from "@pawl/registry";
import registryWasm from "@pawl/registry/pkg/registry_bg.wasm";

import app from "./app";

export default {
  fetch: withInitRegistry(registryWasm, {
    fetch: withInitOidc(oidcWasm, app),
  }),
};
