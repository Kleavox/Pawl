import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./return-to";

const live = {
  hostname: "pass.example.test",
  origin: "https://pass.example.test",
};
const local = { hostname: "localhost", origin: "http://localhost:8786" };
const pawl = {
  hostname: "paw.example.test",
  origin: "https://paw.example.test",
};

describe("safeReturnTo on the Pawl hostname", () => {
  it("keeps a sibling application on the same root domain", () => {
    expect(safeReturnTo("https://link.example.test/files", pawl)).toBe(
      "https://link.example.test/files",
    );
  });

  it("keeps the root domain itself", () => {
    expect(safeReturnTo("https://example.test/", pawl)).toBe(
      "https://example.test/",
    );
  });

  it("still accepts the old hostname while it redirects", () => {
    expect(safeReturnTo("https://pass.example.test/account", pawl)).toBe(
      "https://pass.example.test/account",
    );
  });

  it("rejects a hostname that merely starts with the label", () => {
    expect(safeReturnTo("https://paw.evil.test/account", pawl)).toBeNull();
  });
});

describe("safeReturnTo", () => {
  it("keeps a sibling application on the same root domain", () => {
    expect(safeReturnTo("https://link.example.test/files", live)).toBe(
      "https://link.example.test/files",
    );
  });

  it("keeps the root domain itself, which is where the machine lives", () => {
    expect(safeReturnTo("https://example.test/", live)).toBe(
      "https://example.test/",
    );
  });

  it("refuses a host that only ends with the root domain as a label prefix", () => {
    expect(
      safeReturnTo("https://example.test.attacker.example", live),
    ).toBeNull();
  });

  it("refuses an unrelated host", () => {
    expect(safeReturnTo("https://attacker.example/pay", live)).toBeNull();
  });

  it("refuses a protocol-relative target that borrows the current scheme", () => {
    expect(safeReturnTo("//attacker.example", live)).toBeNull();
  });

  it("refuses a javascript url", () => {
    expect(safeReturnTo("javascript:alert(1)", live)).toBeNull();
  });

  it("refuses plain http in production, where the session cookie is secure", () => {
    expect(safeReturnTo("http://link.example.test/files", live)).toBeNull();
  });

  it("resolves a relative path against the page it came from", () => {
    expect(safeReturnTo("/account", live)).toBe(
      "https://pass.example.test/account",
    );
  });

  it("allows another port on the same host, which is how local development is laid out", () => {
    expect(safeReturnTo("http://localhost:8788/", local)).toBe(
      "http://localhost:8788/",
    );
  });

  it("refuses another host during local development too", () => {
    expect(safeReturnTo("http://attacker.example/", local)).toBeNull();
  });

  it("returns null when nothing was asked for", () => {
    expect(safeReturnTo(null, live)).toBeNull();
  });

  it("returns null rather than throwing on a value that is not a url", () => {
    expect(safeReturnTo("http://[", live)).toBeNull();
  });
});
