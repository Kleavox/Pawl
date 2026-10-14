import { describe, expect, it } from "vitest";

import { CAMERA_HINT_HASH } from "@pawl/ui/camera-hint";

import { headersFile } from "./csp";

function directive(file: string, name: string): string {
  const policy = file.split("Content-Security-Policy: ")[1] ?? "";
  return (
    policy
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? ""
  );
}

describe("the cabinet's content security policy", () => {
  it("lets the cabinet send keypad codes to Pawl and post its sign-out form there", () => {
    const file = headersFile("https://paw.product.test");
    expect(directive(file, "connect-src")).toBe(
      "connect-src 'self' https://paw.product.test",
    );
    expect(directive(file, "form-action")).toBe(
      "form-action 'self' https://paw.product.test",
    );
  });

  it("opens nothing else", () => {
    const file = headersFile("https://paw.product.test");
    expect(directive(file, "script-src")).toBe(
      `script-src 'self' ${CAMERA_HINT_HASH}`,
    );
    expect(directive(file, "default-src")).toBe("default-src 'self'");
    expect(directive(file, "frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("names both loopback spellings of a local Pawl", () => {
    expect(directive(headersFile("http://127.0.0.1:8787"), "form-action")).toBe(
      "form-action 'self' http://127.0.0.1:8787 http://localhost:8787",
    );
  });
});
