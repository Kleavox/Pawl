import { describe, expect, it } from "vitest";

import { contactAddress } from "./legal-facts";

describe("contactAddress", () => {
  it("sends privacy requests to an address on the site's own domain", () => {
    expect(contactAddress("example.com")).toBe("privacy@example.com");
    expect(contactAddress("127.0.0.1:8786")).toBe("privacy@127.0.0.1");
  });
});
