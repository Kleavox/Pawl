import { withInitCrypto } from "@pawl/crypto";
import cryptoWasm from "@pawl/crypto/pkg/crypto_bg.wasm";
import { withInitOidc } from "@pawl/oidc";
import oidcWasm from "@pawl/oidc/pkg/oidc_bg.wasm";
import { withInitRegistry } from "@pawl/registry";
import registryWasm from "@pawl/registry/pkg/registry_bg.wasm";

import app from "./app";

export default {
  fetch: withInitCrypto(cryptoWasm, {
    fetch: withInitRegistry(registryWasm, {
      fetch: withInitOidc(oidcWasm, app),
    }),
  }),
};
