import { describe, expect, it } from "vitest";
import {
  hashAuthVerifier,
  hashToken,
  randomToken,
  verifyAuthVerifier,
} from "./crypto";

describe("auth verifier", () => {
  it("accepts the matching verifier and rejects others", async () => {
    const verifier = randomToken();
    const stored = await hashAuthVerifier(verifier);

    await expect(verifyAuthVerifier(verifier, stored)).resolves.toBe(true);
    await expect(verifyAuthVerifier(randomToken(), stored)).resolves.toBe(
      false,
    );
  });
});

describe("tokens", () => {
  it("generates URL-safe random values and stable hashes", async () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
    await expect(hashToken(token)).resolves.toBe(await hashToken(token));
  });
});
