import type { BayCode, MachineEvent, MachineHost, MachineState } from "./state";

export type Dispatch = (event: MachineEvent) => MachineState;

const RELEASE_SEQUENCE_MS = 1400;
export const DENIED_BLINK_MS = 540;

const REQUEST_KEY = "pawl:machine-request";

export function motionDelay(ms: number, signal?: AbortSignal): Promise<void> {
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
    }, ms);
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
  onDenied: (bay: BayCode) => void = () => {},
): Promise<void> {
  if (machine.read().busy) return;
  const next = machine.dispatch({ type: "select", bay });
  if (next.status === "denied" && next.authRequest === bay) {
    await motionDelay(DENIED_BLINK_MS);
    const now = machine.read();
    if (now.status === "denied" && now.authRequest === bay) onDenied(bay);
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
