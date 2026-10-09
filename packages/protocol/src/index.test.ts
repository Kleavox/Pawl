import { describe, expect, it } from "vitest";

import {
  accountCredentialSchema,
  loginRequestSchema,
  registerRequestSchema,
  usernameSchema,
} from "./index";

const keys = {
  salt: "s".repeat(16),
  authVerifier: "v".repeat(40),
  accountPublicKey: "p".repeat(40),
  wrappedPrivateKey: "w".repeat(40),
};

describe("Pass protocol v1", () => {
  it("accepts a verifier-only login", () => {
    expect(
      loginRequestSchema.safeParse({
        email: "USER@EXAMPLE.COM",
        authVerifier: "v".repeat(40),
      }).success,
    ).toBe(true);
  });

  it("rejects any raw password field", () => {
    expect(
      loginRequestSchema.safeParse({
        email: "user@example.com",
        authVerifier: "v".repeat(40),
        password: "must-never-reach-pass",
      }).success,
    ).toBe(false);
  });

  it("requires a complete Account Credential during registration", () => {
    expect(
      registerRequestSchema.safeParse({
        email: "user@example.com",
        username: "pawl_user",
        keys,
      }).success,
    ).toBe(true);
    expect(
      accountCredentialSchema.safeParse({ ...keys, salt: "short" }).success,
    ).toBe(false);
  });
});

describe("usernameSchema", () => {
  it("refuses a username Pawl keeps for its own pages", () => {
    for (const name of ["pawl", "api", "account", "login", "PRIVACY"]) {
      expect(usernameSchema.safeParse(name).success, name).toBe(false);
    }
  });

  it("accepts an ordinary username", () => {
    expect(usernameSchema.safeParse("ada_lovelace").success).toBe(true);
  });
});
