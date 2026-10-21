import { beforeAll, describe, expect, it } from "vitest";

import { EMPTY_MANIFEST, registryFor, withOutsideApps } from "./index";
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

  it("keeps the manifest and the one merged with outside apps side by side, as the gateway asks for both", () => {
    const merged = withOutsideApps(MANIFEST, [
      {
        key: "adns",
        label: "dns",
        title: "DNS",
        origin: "https://adns.example",
        access: "visitor",
        card: true,
      },
    ]);
    const base = registryFor(MANIFEST);
    const both = registryFor(merged);
    expect(registryFor(MANIFEST)).toBe(base);
    expect(registryFor(merged)).toBe(both);
  });

  it("refuses an invalid manifest with every problem named", () => {
    const invalid = JSON.stringify({
      site: { name: "" },
      apps: [{ key: "pass", label: "pass", title: "Pass" }],
    });
    expect(() => registryFor(invalid)).toThrow(/site name/);
    expect(() => registryFor(invalid)).toThrow(/belongs to Pawl/);
  });

  it("adds outside apps beside the manifest's own, linked by their origin", () => {
    const merged = withOutsideApps(MANIFEST, [
      {
        key: "dns",
        label: "dns",
        title: "DNS",
        origin: "https://enroll.elsewhere.test",
        access: "visitor",
        card: true,
      },
    ]);
    const bays = registryFor(merged).publicView(
      "https://example.test",
      "https://paw.example.test",
    ).bays;
    expect(bays.map((bay) => bay.key).sort()).toEqual(["dns", "notes"]);
    expect(bays.find((bay) => bay.key === "dns")).toMatchObject({
      href: "https://enroll.elsewhere.test",
      card: true,
    });
    expect(withOutsideApps(MANIFEST, [])).toBe(MANIFEST);
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
