import { beforeAll, describe, expect, it } from "vitest";

import { EMPTY_MANIFEST, registryFor } from "./index";
import { initRegistryFromDisk } from "./node";

const MANIFEST = JSON.stringify({
  site: { name: "Example" },
  apps: [
    {
      key: "notes",
      label: "notes",
      title: "Notes",
      subdomain: "notes",
      service: "notes",
      proxy: ["/api/notes/"],
      estate: true,
      header: { noun: "notes" },
      local: { port: 8790 },
    },
  ],
});

beforeAll(() => {
  initRegistryFromDisk();
});

describe("registryFor", () => {
  it("routes through the Rust core", () => {
    expect(
      registryFor(MANIFEST).route(
        "example.test",
        "example.test",
        "/api/notes/x",
      ),
    ).toEqual({
      kind: "proxy",
      key: "notes",
      binding: "APP_NOTES",
      host: "notes.internal",
    });
  });

  it("hands back the same registry for the same manifest", () => {
    expect(registryFor(MANIFEST)).toBe(registryFor(MANIFEST));
  });

  it("refuses an invalid manifest with every problem named", () => {
    const invalid = JSON.stringify({
      site: { name: "" },
      apps: [{ key: "pass", label: "pass", title: "Pass" }],
    });
    expect(() => registryFor(invalid)).toThrow(/site name/);
    expect(() => registryFor(invalid)).toThrow(/belongs to Pawl/);
  });

  it("starts empty when nothing is registered", () => {
    expect(
      registryFor(EMPTY_MANIFEST).publicView(
        "https://example.test",
        "https://paw.example.test",
      ).tools,
    ).toHaveLength(1);
  });
});
