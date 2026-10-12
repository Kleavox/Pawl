import { describe, expect, it } from "vitest";

import { hostRedirect } from "./hosts";

describe("gateway host redirects", () => {
  it("normalizes www while preserving path and query", () => {
    expect(
      hostRedirect(
        new URL("https://www.product.test/about?from=www"),
        "https://product.test",
      )?.toString(),
    ).toBe("https://product.test/about?from=www");
  });

  it("does not redirect canonical or unrelated hosts", () => {
    expect(
      hostRedirect(
        new URL("https://product.test/about"),
        "https://product.test",
      ),
    ).toBeNull();
    expect(
      hostRedirect(new URL("https://other.test/about"), "https://product.test"),
    ).toBeNull();
  });
});
