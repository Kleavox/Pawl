import type { FormEvent } from "react";
import { describe, expect, it } from "vitest";

import { guarded } from "./ui";

function submit(): { event: FormEvent; prevented: () => boolean } {
  let prevented = false;
  const event = {
    preventDefault: () => {
      prevented = true;
    },
  } as FormEvent;
  return { event, prevented: () => prevented };
}

describe("a form the GO key can reach", () => {
  it("passes a submit through while the form is ready", () => {
    let calls = 0;
    const { event, prevented } = submit();
    guarded(false, () => {
      calls += 1;
    })(event);
    expect(calls).toBe(1);
    expect(prevented()).toBe(false);
  });

  it("swallows a second submit while one is working or after it is done", () => {
    let calls = 0;
    const { event, prevented } = submit();
    guarded(true, () => {
      calls += 1;
    })(event);
    expect(calls).toBe(0);
    expect(prevented()).toBe(true);
  });
});
