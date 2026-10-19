import { settle } from "@pawl/ui";

export const FEED_MS = 540;
export const TEAR_JERK_MS = 90;
export const TEAR_RIP_MS = 120;
export const STEP_BACK_MS = 620;
export const CRUMPLE_MS = 260;
export const THROW_MS = 450;
export const SWALLOW_MS = 200;
const TRAY_MOUTH = 0.35;

function wait(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function centre(box: DOMRect, down = 0.5): { x: number; y: number } {
  return { x: box.left + box.width / 2, y: box.top + box.height * down };
}

export async function printOut(
  sheet: HTMLElement,
  camera: HTMLElement | null,
): Promise<void> {
  sheet.dataset.stage = "feed";
  await wait(FEED_MS);
  sheet.dataset.stage = "jerk";
  await wait(TEAR_JERK_MS);
  sheet.dataset.stage = "rip";
  await wait(TEAR_RIP_MS);
  sheet.dataset.stage = "hand";
  await Promise.all([
    camera === null ? null : settle(camera, "printer", "whole"),
    wait(STEP_BACK_MS),
  ]);
}

function aim(sheet: HTMLElement, machine: HTMLElement | null): void {
  const ball = sheet.querySelector<HTMLElement>("[data-receipt-ball]");
  const tray = machine?.querySelector<HTMLElement>("[data-part='tray']");
  if (ball === null || tray === null || tray === undefined) return;
  const from = centre(ball.getBoundingClientRect());
  const to = centre(tray.getBoundingClientRect(), TRAY_MOUTH);
  sheet.style.setProperty("--ball-x", `${Math.round(to.x - from.x)}px`);
  sheet.style.setProperty("--ball-y", `${Math.round(to.y - from.y)}px`);
}

export async function crumpleInto(
  sheet: HTMLElement,
  machine: HTMLElement | null,
): Promise<boolean> {
  if (sheet.dataset.stage !== "hand") return false;
  sheet.dataset.stage = "crumple";
  await wait(CRUMPLE_MS);
  aim(sheet, machine);
  sheet.dataset.stage = "ball";
  await wait(THROW_MS);
  sheet.dataset.stage = "gone";
  if (machine !== null) machine.dataset.swallow = "";
  await wait(SWALLOW_MS);
  if (machine !== null) delete machine.dataset.swallow;
  return true;
}

export function holdOut(sheet: HTMLElement): void {
  sheet.dataset.stage = "hand";
}
