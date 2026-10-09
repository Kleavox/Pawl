import { describe, expect, it, vi } from "vitest";

import { getPublicOrigin, PUBLIC_SUBDOMAINS } from "./index";

describe("public origins", () => {
  it("keeps the deployed shape on a real domain", () => {
    expect(getPublicOrigin("https://example.test")).toBe(
      "https://example.test",
    );
    expect(getPublicOrigin("https://example.test", "link")).toBe(
      "https://link.example.test",
    );
    expect(getPublicOrigin("https://example.test", "port")).toBe(
      "https://port.example.test",
    );
    expect(
      getPublicOrigin("https://example.test", PUBLIC_SUBDOMAINS.pass),
    ).toBe("https://paw.example.test");
  });
});

describe("local origins", () => {
  it("answers with worker ports when the root is the gateway worker", () => {
    expect(
      getPublicOrigin("http://127.0.0.1:8786", PUBLIC_SUBDOMAINS.pass),
    ).toBe("http://127.0.0.1:8787");
    expect(getPublicOrigin("http://127.0.0.1:8786", "link")).toBe(
      "http://127.0.0.1:8788",
    );
  });

  it("answers with vite ports when the root is the gateway vite server", () => {
    expect(getPublicOrigin("http://localhost:3000", "link")).toBe(
      "http://localhost:3002",
    );
  });

  it("treats every loopback host the same, and keeps the host it was given", () => {
    for (const host of ["localhost", "127.0.0.1", "127.0.0.2", "[::1]"]) {
      expect(getPublicOrigin(`http://${host}:8786`, "link")).toBe(
        `http://${host}:8788`,
      );
    }
  });

  it("never invents a subdomain of a loopback address", () => {
    for (const root of [
      "http://127.0.0.1:8786",
      "http://localhost:3000",
      "http://localhost:8786",
    ]) {
      for (const subdomain of [PUBLIC_SUBDOMAINS.pass, "link", "port"]) {
        const resolved = new URL(getPublicOrigin(root, subdomain));
        expect(resolved.hostname).toBe(new URL(root).hostname);
        expect(resolved.protocol).toBe("http:");
      }
    }
  });

  it("sends portfolio to its vite server, the only local address it has", () => {
    expect(getPublicOrigin("http://127.0.0.1:8786", "port")).toBe(
      "http://127.0.0.1:3004",
    );
    expect(getPublicOrigin("http://localhost:3000", "port")).toBe(
      "http://localhost:3004",
    );
  });

  it("stays on the root origin when the port belongs to no known family, and says so", () => {
    const warned = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    expect(getPublicOrigin("http://127.0.0.1:4321", "link")).toBe(
      "http://127.0.0.1:4321",
    );
    expect(warned).toHaveBeenCalledOnce();
    expect(warned.mock.calls[0]?.[0]).toContain("wrong app");
    warned.mockRestore();
  });

  it("stays on the root origin for a subdomain it does not know", () => {
    expect(getPublicOrigin("http://127.0.0.1:8786", "drop")).toBe(
      "http://127.0.0.1:8786",
    );
  });
});
