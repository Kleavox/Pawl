import { describe, expect, it } from "vitest";

import { greetConsole } from "./console";

describe("the console greeting", () => {
  it("says STOP, warns against pasting in the site's name, then names the secret", () => {
    const said: string[][] = [];
    greetConsole("Fixture", (...parts) => said.push(parts));
    expect(said).toHaveLength(3);
    expect(said[0]![0]).toBe("%cSTOP");
    expect(said[0]![1]).toMatch(/font-size/);
    expect(said[1]!.join(" ")).toMatch(/paste/);
    expect(said[1]!.join(" ")).toContain("Fixture");
    expect(said[2]!.join(" ")).toContain("4-2-3-1");
  });
});
