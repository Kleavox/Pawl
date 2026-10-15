export const TEAR_JERK_MS = 90;
export const TEAR_RIP_MS = 120;
export const TEAR_FALL_MS = 560;
export const FEED_MS = 540;
const SCROLL_BACK_MS = 340;

function wait(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

export async function tearOff(
  frame: HTMLElement,
  options: { reduced: boolean },
): Promise<void> {
  if (options.reduced) return;
  frame.dataset.torn = "jerk";
  await wait(TEAR_JERK_MS);
  frame.dataset.torn = "rip";
  await wait(TEAR_RIP_MS);
  frame.dataset.torn = "fall";
  await wait(TEAR_FALL_MS);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function scrollBack(
  frame: HTMLElement,
  options: { reduced: boolean },
): Promise<void> {
  const from = frame.scrollTop;
  if (from <= 0) return Promise.resolve();
  if (options.reduced) {
    frame.scrollTop = 0;
    return Promise.resolve();
  }
  const start = performance.now();
  return new Promise((done) => {
    const step = (): void => {
      const t = Math.min(1, (performance.now() - start) / SCROLL_BACK_MS);
      frame.scrollTop = Math.round(from * (1 - easeInOut(t)));
      if (t < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
}
