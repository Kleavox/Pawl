import { beforeAll, describe, expect, it } from "vitest";

import { jwkOf, pkceS256, signClaims, verifiedClaims } from "./index";
import { initOidcFromDisk } from "./node";

async function generated(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  return Buffer.from(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  ).toString("base64");
}

beforeAll(() => {
  initOidcFromDisk();
});

describe("@pawl/oidc", () => {
  it("verifies what it signed and nothing else", async () => {
    const key = await generated();
    const token = signClaims(key, {
      iss: "https://paw.example.test",
      aud: "a",
      sub: "u",
      exp: 2_000_000_000,
    });
    expect(
      verifiedClaims(
        token,
        [jwkOf(key)],
        "https://paw.example.test",
        "a",
        1_900_000_000_000,
      )?.sub,
    ).toBe("u");
    expect(
      verifiedClaims(
        token,
        [jwkOf(await generated())],
        "https://paw.example.test",
        "a",
        1_900_000_000_000,
      ),
    ).toBeNull();
  });

  it("computes the RFC 7636 challenge", () => {
    expect(pkceS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
