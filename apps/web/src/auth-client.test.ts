import { describe, expect, it } from "vitest";
import { silentSignInPath } from "./auth-client";

describe("silentSignInPath", () => {
  it("asks the gateway to sign in silently and come back to this page", () => {
    expect(silentSignInPath({ pathname: "/", search: "?bay=2" })).toBe(
      "/auth/signin?returnTo=%2F%3Fbay%3D2&prompt=none",
    );
  });
});
