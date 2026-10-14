import type { Framing } from "./machine/parts";

export type { Framing };

type Hinted = Exclude<Framing, "whole">;

const HINTS: Readonly<Record<string, Hinted>> = {
  "#cam=screen": "screen",
  "#cam=printer": "printer",
};

const DOLLY_MS = 560;
const PULL_BACK_MS = 620;
const LONGEST_LEAVE_MS = 600;
const STILL_HERE_MS = 3000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const leaving = new WeakMap<HTMLElement, Promise<void>>();

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function decoded(hash: string): string {
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

export function arrivalFraming(hash: string): Framing {
  return HINTS[decoded(hash)] ?? "whole";
}

export function withCamHint(url: string, framing: Hinted): string {
  return `${url.split("#")[0]}#cam=${framing}`;
}

export function cleanCamHint(location: Location, history: History): void {
  if (!decoded(location.hash).startsWith("#cam=")) return;
  history.replaceState(history.state, "", location.pathname + location.search);
}

export function shouldAnimateClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function leave(
  camera: HTMLElement,
  to: Framing,
  url: string,
  options: {
    durationMs?: number;
    reduced?: boolean;
    go?: (url: string) => void;
    stay?: () => void;
  } = {},
): Promise<void> {
  const running = leaving.get(camera);
  if (running !== undefined) return running;
  const go = options.go ?? ((next: string) => window.location.assign(next));
  const depart = (): void => {
    go(url);
    setTimeout(() => {
      if (leaving.get(camera) !== trip) return;
      leaving.delete(camera);
      options.stay?.();
    }, STILL_HERE_MS);
  };
  let trip: Promise<void>;
  if (options.reduced ?? reducedMotion()) {
    trip = Promise.resolve();
    leaving.set(camera, trip);
    depart();
    return trip;
  }
  camera.dataset.moving = "in";
  camera.dataset.framing = to;
  trip = wait(Math.min(options.durationMs ?? DOLLY_MS, LONGEST_LEAVE_MS)).then(
    depart,
  );
  leaving.set(camera, trip);
  return trip;
}

export async function settle(
  camera: HTMLElement,
  from: Framing,
  to: Framing,
  options: { reduced?: boolean; moving?: "in" | "out" } = {},
): Promise<void> {
  leaving.delete(camera);
  if (from === to || (options.reduced ?? reducedMotion())) {
    delete camera.dataset.moving;
    camera.dataset.framing = to;
    delete document.documentElement.dataset.camHint;
    return;
  }
  delete camera.dataset.moving;
  camera.dataset.framing = from;
  delete document.documentElement.dataset.camHint;
  void camera.offsetWidth;
  const moving = options.moving ?? "out";
  camera.dataset.moving = moving;
  camera.dataset.framing = to;
  await wait(moving === "in" ? DOLLY_MS : PULL_BACK_MS);
  if (camera.dataset.framing === to) delete camera.dataset.moving;
}
