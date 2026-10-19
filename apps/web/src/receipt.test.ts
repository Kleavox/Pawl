import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CRUMPLE_MS,
  FEED_MS,
  STEP_BACK_MS,
  SWALLOW_MS,
  TEAR_JERK_MS,
  TEAR_RIP_MS,
  THROW_MS,
  crumpleInto,
  holdOut,
  printOut,
} from "./receipt";

afterEach(() => {
  vi.useRealTimers();
});

function boxed(node: HTMLElement, box: Partial<DOMRect>): void {
  node.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 0, height: 0, ...box }) as DOMRect;
}

function scene(): {
  sheet: HTMLElement;
  camera: HTMLElement;
  machine: HTMLElement;
  ball: HTMLElement;
  tray: HTMLElement;
} {
  const sheet = document.createElement("div");
  const ball = document.createElement("span");
  ball.dataset.receiptBall = "";
  sheet.append(ball);
  const camera = document.createElement("div");
  const machine = document.createElement("div");
  const tray = document.createElement("div");
  tray.dataset.part = "tray";
  machine.append(tray);
  camera.append(machine);
  return { sheet, camera, machine, ball, tray };
}

describe("the paper's timings", () => {
  it("feeds for 540 ms, steps back in 620, crumples in 260, flies for 450 and lands in 200", () => {
    expect([FEED_MS, STEP_BACK_MS, CRUMPLE_MS, THROW_MS, SWALLOW_MS]).toEqual([
      540, 620, 260, 450, 200,
    ]);
  });
});

describe("printOut", () => {
  it("feeds, jerks, rips and comes to hand, stepping the camera back to the whole", async () => {
    vi.useFakeTimers();
    const { sheet, camera } = scene();
    camera.dataset.framing = "printer";
    let done = false;
    const printing = printOut(sheet, camera).then(() => {
      done = true;
    });
    expect(sheet.dataset.stage).toBe("feed");
    await vi.advanceTimersByTimeAsync(FEED_MS);
    expect(sheet.dataset.stage).toBe("jerk");
    await vi.advanceTimersByTimeAsync(TEAR_JERK_MS);
    expect(sheet.dataset.stage).toBe("rip");
    expect(camera.dataset.framing).toBe("printer");
    await vi.advanceTimersByTimeAsync(TEAR_RIP_MS);
    expect(sheet.dataset.stage).toBe("hand");
    expect(camera.dataset.framing).toBe("whole");
    expect(camera.dataset.moving).toBe("out");
    await vi.advanceTimersByTimeAsync(STEP_BACK_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await printing;
    expect(done).toBe(true);
  });

  it("comes to hand without a camera to move", async () => {
    vi.useFakeTimers();
    const { sheet } = scene();
    const printing = printOut(sheet, null);
    await vi.advanceTimersByTimeAsync(
      FEED_MS + TEAR_JERK_MS + TEAR_RIP_MS + STEP_BACK_MS,
    );
    await printing;
    expect(sheet.dataset.stage).toBe("hand");
  });
});

describe("crumpleInto", () => {
  it("crumples only from the hand, once, however often it is asked", async () => {
    vi.useFakeTimers();
    const { sheet, machine } = scene();
    sheet.dataset.stage = "rip";
    expect(await crumpleInto(sheet, machine)).toBe(false);
    expect(sheet.dataset.stage).toBe("rip");
    sheet.dataset.stage = "hand";
    const first = crumpleInto(sheet, machine);
    expect(sheet.dataset.stage).toBe("crumple");
    const second = crumpleInto(sheet, machine);
    await vi.advanceTimersByTimeAsync(CRUMPLE_MS);
    expect(sheet.dataset.stage).toBe("ball");
    await vi.advanceTimersByTimeAsync(THROW_MS + SWALLOW_MS);
    expect([await first, await second]).toEqual([true, false]);
    expect(sheet.dataset.stage).toBe("gone");
  });

  it("aims the ball at the tray where it is when the throw begins", async () => {
    vi.useFakeTimers();
    const { sheet, machine, ball, tray } = scene();
    sheet.dataset.stage = "hand";
    boxed(ball, { left: 100, top: 100, width: 44, height: 44 });
    boxed(tray, { left: 0, top: 0, width: 10, height: 10 });
    const crumpling = crumpleInto(sheet, machine);
    boxed(tray, { left: 300, top: 500, width: 200, height: 100 });
    await vi.advanceTimersByTimeAsync(CRUMPLE_MS);
    expect(sheet.style.getPropertyValue("--ball-x")).toBe("278px");
    expect(sheet.style.getPropertyValue("--ball-y")).toBe("413px");
    await vi.advanceTimersByTimeAsync(THROW_MS + SWALLOW_MS);
    await crumpling;
  });

  it("thunks the tray's flap once, for 200 ms, as the ball lands", async () => {
    vi.useFakeTimers();
    const { sheet, machine } = scene();
    sheet.dataset.stage = "hand";
    let done = false;
    const crumpling = crumpleInto(sheet, machine).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(CRUMPLE_MS + THROW_MS - 1);
    expect(machine.dataset.swallow).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(machine.dataset.swallow).toBe("");
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(SWALLOW_MS);
    await crumpling;
    expect(machine.dataset.swallow).toBeUndefined();
    expect(done).toBe(true);
  });

  it("still finishes when there is no machine to throw into", async () => {
    vi.useFakeTimers();
    const { sheet } = scene();
    sheet.dataset.stage = "hand";
    const crumpling = crumpleInto(sheet, null);
    await vi.advanceTimersByTimeAsync(CRUMPLE_MS + THROW_MS + SWALLOW_MS);
    expect(await crumpling).toBe(true);
    expect(sheet.dataset.stage).toBe("gone");
  });
});

describe("holdOut", () => {
  it("puts the paper in the hand at once", () => {
    const { sheet } = scene();
    sheet.dataset.stage = "gone";
    holdOut(sheet);
    expect(sheet.dataset.stage).toBe("hand");
  });
});
