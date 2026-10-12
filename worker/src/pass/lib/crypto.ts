import {
  encodeBase64Url,
  sha256Base64Url,
  timingSafeEqual,
} from "@pawl/crypto";

export { randomToken, sha256Base64Url as hashToken } from "@pawl/crypto";

const encoder = new TextEncoder();

export async function hashAuthVerifier(verifier: string): Promise<string> {
  return sha256Base64Url(verifier);
}

export async function verifyAuthVerifier(
  verifier: string,
  storedHash: string,
): Promise<boolean> {
  const candidate = await sha256Base64Url(verifier);
  return timingSafeEqual(encoder.encode(candidate), encoder.encode(storedHash));
}

export async function hashAuditIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(ip));
  return encodeBase64Url(new Uint8Array(signature));
}
