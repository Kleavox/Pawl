import type { BayCode, MachineEvent, MachineHost, MachineState } from "./state";

export type Dispatch = (event: MachineEvent) => MachineState;

export const RELEASE_SEQUENCE_MS = 1400;
export const DENIED_BLINK_MS = 540;
const REDUCED_MOTION_MS = 40;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const REQUEST_KEY = "pawl:machine-request";

function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

export function motionDelay(ms: number, signal?: AbortSignal): Promise<void> {
  const wait = prefersReducedMotion() ? Math.min(ms, REDUCED_MOTION_MS) : ms;
  return new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = (): void => {
      clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, wait);
    signal?.addEventListener("abort", stop, { once: true });
  });
}

export function rememberRequest(bay: BayCode): boolean {
  try {
    globalThis.sessionStorage.setItem(REQUEST_KEY, bay);
    return true;
  } catch {
    return false;
  }
}

export function readRememberedRequest(
  codes: readonly BayCode[],
): BayCode | null {
  try {
    const stored = globalThis.sessionStorage.getItem(REQUEST_KEY);
    return codes.find((code) => code === stored) ?? null;
  } catch {
    return null;
  }
}

export function forgetRequest(): void {
  try {
    globalThis.sessionStorage.removeItem(REQUEST_KEY);
  } catch {
    return;
  }
}

export async function runDispense(
  machine: MachineHost,
  bay: BayCode,
): Promise<void> {
  if (machine.read().busy) return;
  const next = machine.dispatch({ type: "select", bay });
  if (next.status === "denied" && next.authRequest === bay) {
    await motionDelay(DENIED_BLINK_MS);
    const now = machine.read();
    if (now.status === "denied" && now.authRequest === bay) {
      machine.dispatch({ type: "open-sign-in" });
    }
    return;
  }
  if (next.status !== "dispensing") return;
  await runRelease(machine);
}

export async function runRelease(machine: MachineHost): Promise<void> {
  if (machine.read().status !== "dispensing") return;
  await motionDelay(RELEASE_SEQUENCE_MS);
  machine.dispatch({ type: "tray-ready" });
}

export async function runScreenTransfer(
  dispatch: Dispatch,
  navigate: (bay: BayCode) => void,
  signal?: AbortSignal,
): Promise<void> {
  const bridging = dispatch({ type: "activate-tray" });
  const bay = bridging.screenTransfer;
  if (bay === null) return;
  await motionDelay(RELEASE_SEQUENCE_MS, signal);
  if (signal?.aborted === true) {
    dispatch({ type: "cancel" });
    return;
  }
  navigate(bay);
}
