import { describe, expect, it } from "vitest";

import { signInHref } from "./sign-in";

describe("signInHref", () => {
  it("sends sign-in to paw. with a return to the gateway's silent sign-in", () => {
    expect(
      signInHref("https://paw.example.test", {
        origin: "https://example.test",
        pathname: "/",
        search: "",
      }),
    ).toBe(
      "https://paw.example.test/?returnTo=" +
        encodeURIComponent(
          "https://example.test/auth/signin?returnTo=%2F&prompt=none",
        ),
    );
  });

  it("keeps where the guest was on the cabinet", () => {
    const href = signInHref("https://paw.example.test", {
      origin: "https://example.test",
      pathname: "/",
      search: "?bay=2",
    });
    const back = new URL(new URL(href).searchParams.get("returnTo")!);
    expect(back.searchParams.get("returnTo")).toBe("/?bay=2");
    expect(back.searchParams.get("prompt")).toBe("none");
  });
});
