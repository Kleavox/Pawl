import { withInitCrypto } from "@pawl/crypto";
import cryptoWasm from "@pawl/crypto/pkg/crypto_bg.wasm";
import app from "./app";

export default {
  fetch: withInitCrypto(cryptoWasm, app),
};
