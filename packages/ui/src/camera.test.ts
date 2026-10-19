import { afterEach, describe, expect, it, vi } from "vitest";

import {
  arrivalFraming,
  cleanCamHint,
  leave,
  settle,
  shouldAnimateClick,
  withCamHint,
} from "./camera";

function camera(): HTMLElement {
  return { dataset: {} } as unknown as HTMLElement;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("arrivalFraming", () => {
  it("frames whole unless the hint names a framing exactly", () => {
    expect(arrivalFraming("#cam=screen")).toBe("screen");
    expect(arrivalFraming("#cam=printer")).toBe("printer");
    for (const odd of [
      "",
      "#",
      "#cam=",
      "#cam=whole",
      "#cam=SCREEN",
      "#cam=../x",
      "#cam=screen&cam=printer",
      "#cam=screen ",
      "#x",
      "cam=screen",
    ]) {
      expect(arrivalFraming(odd)).toBe("whole");
    }
  });
});

describe("a hint written with percent escapes", () => {
  it("is read the way the address bar reads it", () => {
    expect(arrivalFraming("#cam%3Dscreen")).toBe("screen");
    expect(arrivalFraming("#%63am=printer")).toBe("printer");
    expect(arrivalFraming("#cam%3D%2E%2E")).toBe("whole");
    expect(arrivalFraming("#%E0%A4%A")).toBe("whole");
  });
});

describe("withCamHint", () => {
  it("puts the hint in the fragment, replacing any fragment already there", () => {
    expect(withCamHint("/", "printer")).toBe("/#cam=printer");
    expect(withCamHint("/privacy.html#section-2", "printer")).toBe(
      "/privacy.html#cam=printer",
    );
    expect(withCamHint("https://paw.example.test/?a=1", "screen")).toBe(
      "https://paw.example.test/?a=1#cam=screen",
    );
  });
});

describe("cleanCamHint", () => {
  function at(hash: string) {
    const replaceState = vi.fn();
    const location = { hash, pathname: "/p", search: "?q=1" } as Location;
    const history = {
      state: { keep: true },
      replaceState,
    } as unknown as History;
    cleanCamHint(location, history);
    return replaceState;
  }

  it("takes the hint out of the address without a new history entry", () => {
    expect(at("#cam=printer")).toHaveBeenCalledWith(
      { keep: true },
      "",
      "/p?q=1",
    );
  });

  it("leaves any other fragment alone", () => {
    expect(at("#terms-3")).not.toHaveBeenCalled();
    expect(at("")).not.toHaveBeenCalled();
  });

  it("takes out a hint it will not honour, too", () => {
    expect(at("#cam=../x")).toHaveBeenCalledTimes(1);
  });

  it("takes out a hint written with percent escapes", () => {
    expect(at("#cam%3Dscreen")).toHaveBeenCalledTimes(1);
    expect(at("#%E0%A4%A")).not.toHaveBeenCalled();
  });
});

describe("shouldAnimateClick", () => {
  function click(init: MouseEventInit & { defaultPrevented?: boolean }) {
    return {
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      ...init,
    } as MouseEvent;
  }

  it("animates a plain primary click", () => {
    expect(shouldAnimateClick(click({}))).toBe(true);
  });

  it("does not animate a modified or middle click, or one already handled", () => {
    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
      { defaultPrevented: true },
    ]) {
      expect(shouldAnimateClick(click(init))).toBe(false);
    }
  });
});

describe("leave", () => {
  it("moves the camera to the framing it is going to, then goes", async () => {
    vi.useFakeTimers();
    const cam = camera();
    const go = vi.fn();
    const done = leave(cam, "printer", "/privacy.html#cam=printer", {
      reduced: false,
      go,
    });
    expect(cam.dataset.framing).toBe("printer");
    expect(cam.dataset.moving).toBe("in");
    expect(go).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(560);
    await done;
    expect(go).toHaveBeenCalledWith("/privacy.html#cam=printer");
  });

  it("leaves once however often it is asked", async () => {
    vi.useFakeTimers();
    const cam = camera();
    const go = vi.fn();
    const first = leave(cam, "printer", "/a", { reduced: false, go });
    const second = leave(cam, "screen", "/b", { reduced: false, go });
    await vi.advanceTimersByTimeAsync(600);
    await Promise.all([first, second]);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith("/a");
    expect(cam.dataset.framing).toBe("printer");
  });

  it("goes at once under reduced motion, without moving the camera", async () => {
    const cam = camera();
    const go = vi.fn();
    await leave(cam, "printer", "/a", { reduced: true, go });
    expect(go).toHaveBeenCalledTimes(1);
    expect(cam.dataset.framing).toBeUndefined();
  });

  it("goes once under reduced motion however often it is asked", async () => {
    const cam = camera();
    const go = vi.fn();
    await leave(cam, "printer", "/a", { reduced: true, go });
    await leave(cam, "printer", "/a", { reduced: true, go });
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("frees the camera and says so when the page is still here long after it went", async () => {
    vi.useFakeTimers();
    const cam = camera();
    const go = vi.fn();
    const stay = vi.fn();
    void leave(cam, "printer", "/a", { reduced: false, go, stay });
    await vi.advanceTimersByTimeAsync(560);
    expect(stay).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(9000);
    expect(stay).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(stay).toHaveBeenCalledTimes(1);
    void leave(cam, "printer", "/b", { reduced: false, go });
    await vi.advanceTimersByTimeAsync(560);
    expect(go).toHaveBeenLastCalledWith("/b");
  });

  it("never waits longer than 600 ms before going", async () => {
    vi.useFakeTimers();
    const go = vi.fn();
    void leave(camera(), "screen", "/a", {
      reduced: false,
      go,
      durationMs: 5000,
    });
    await vi.advanceTimersByTimeAsync(600);
    expect(go).toHaveBeenCalledTimes(1);
  });
});

describe("settle", () => {
  it("takes the framing over from the page's hint", async () => {
    document.documentElement.dataset.camHint = "printer";
    const cam = camera();
    await settle(cam, "printer", "whole", { reduced: true });
    expect(document.documentElement.dataset.camHint).toBeUndefined();
  });

  it("starts in the arriving framing and pulls back to where the page lives", async () => {
    vi.useFakeTimers();
    const cam = camera();
    const done = settle(cam, "printer", "whole", { reduced: false });
    expect(cam.dataset.framing).toBe("whole");
    expect(cam.dataset.moving).toBe("out");
    await vi.advanceTimersByTimeAsync(620);
    await done;
    expect(cam.dataset.moving).toBeUndefined();
  });

  it("dollies in with the dolly's own motion when asked, as an establishing shot", async () => {
    vi.useFakeTimers();
    const cam = camera();
    const done = settle(cam, "whole", "screen", {
      reduced: false,
      moving: "in",
    });
    expect(cam.dataset.moving).toBe("in");
    expect(cam.dataset.framing).toBe("screen");
    await vi.advanceTimersByTimeAsync(560);
    await done;
    expect(cam.dataset.moving).toBeUndefined();
  });

  it("jumps straight to where the page lives under reduced motion", async () => {
    const cam = camera();
    await settle(cam, "printer", "whole", { reduced: true });
    expect(cam.dataset.framing).toBe("whole");
    expect(cam.dataset.moving).toBeUndefined();
  });

  it("lets a page restored from the back/forward cache leave again", async () => {
    vi.useFakeTimers();
    const cam = camera();
    const go = vi.fn();
    void leave(cam, "printer", "/a", { reduced: false, go });
    await vi.advanceTimersByTimeAsync(560);
    await settle(cam, "printer", "whole", { reduced: true });
    void leave(cam, "printer", "/a", { reduced: false, go });
    await vi.advanceTimersByTimeAsync(560);
    expect(go).toHaveBeenCalledTimes(2);
  });
});
