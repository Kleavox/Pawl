import init, {
  initSync,
  pairwiseSub,
  pkceS256,
  publicJwk,
  signJwt,
  verifyJwt,
} from "../pkg/oidc.js";

export interface PublicJwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
  alg: "ES256";
  use: "sig";
  kid: string;
}

export function jwkOf(pkcs8: string): PublicJwk {
  return JSON.parse(publicJwk(pkcs8)) as PublicJwk;
}

export function signClaims(
  pkcs8: string,
  claims: Record<string, unknown>,
): string {
  return signJwt(pkcs8, JSON.stringify(claims));
}

export function verifiedClaims(
  token: string,
  keys: PublicJwk[],
  issuer: string,
  audience: string,
  nowMs: number,
): Record<string, unknown> | null {
  const claims = verifyJwt(
    token,
    JSON.stringify(keys),
    issuer,
    audience,
    Math.floor(nowMs / 1000),
  );
  return claims === "" ? null : (JSON.parse(claims) as Record<string, unknown>);
}

export { pairwiseSub, pkceS256 };

export async function initOidc(
  wasm: WebAssembly.Module | BufferSource,
): Promise<void> {
  await init({ module_or_path: wasm });
}

export function initOidcSync(wasm: WebAssembly.Module | BufferSource): void {
  initSync({ module: wasm });
}

export function withInitOidc<F extends (...args: never[]) => unknown>(
  wasm: WebAssembly.Module | BufferSource,
  app: { fetch: F },
): F {
  let ready: Promise<void> | undefined;
  const handler = async (...args: Parameters<F>) => {
    ready ??= initOidc(wasm);
    await ready;
    return app.fetch(...args);
  };
  return handler as unknown as F;
}
