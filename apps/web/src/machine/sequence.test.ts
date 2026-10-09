import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RELEASE_SEQUENCE_MS,
  forgetRequest,
  motionDelay,
  readRememberedRequest,
  rememberRequest,
  runDispense,
  runReaderScan,
  runRelease,
  runScreenTransfer,
  type Dispatch,
} from "./sequence";
import {
  initialState,
  reduce,
  type AccessRole,
  type BayCode,
  type MachineEvent,
  type MachineState,
} from "./state";

const REQUEST_KEY = "pawl:machine-request";

function machine(access: AccessRole): {
  dispatch: Dispatch;
  seen: MachineEvent["type"][];
  read: () => MachineState;
} {
  let state = initialState(access);
  const seen: MachineEvent["type"][] = [];
  const dispatch: Dispatch = (event) => {
    seen.push(event.type);
    state = reduce(state, event);
    return state;
  };
  return { dispatch, seen, read: () => state };
}

function reduceMotion(reduced: boolean): void {
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("motionDelay", () => {
  it("shortens but never skips when motion is reduced", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const started = Date.now();
    await motionDelay(900);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it("waits the whole duration when motion is not reduced", async () => {
    reduceMotion(false);
    vi.useFakeTimers();
    let settled = false;
    const waiting = motionDelay(900).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(880);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(40);
    await waiting;
    expect(settled).toBe(true);
  });

  it("resolves at once when the wait is aborted", async () => {
    reduceMotion(false);
    const controller = new AbortController();
    const started = Date.now();
    const waiting = motionDelay(900, controller.signal);
    controller.abort();
    await waiting;
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe("remembering a locked request across a redirect", () => {
  it("reads the bay back without spending it", () => {
    rememberRequest("1");
    expect(readRememberedRequest()).toBe("1");
    expect(readRememberedRequest()).toBe("1");
  });

  it("hands the bay back no more once it has been forgotten", () => {
    rememberRequest("1");
    expect(readRememberedRequest()).toBe("1");
    forgetRequest();
    expect(readRememberedRequest()).toBeNull();
  });

  it("returns null when nothing was remembered", () => {
    expect(readRememberedRequest()).toBeNull();
  });

  it("survives a page load because it lives in sessionStorage", () => {
    rememberRequest("3");
    expect(sessionStorage.getItem(REQUEST_KEY)).toBe("3");
    expect(readRememberedRequest()).toBe("3");
    forgetRequest();
    expect(sessionStorage.getItem(REQUEST_KEY)).toBeNull();
  });

  it("refuses a stored value that is not a bay", () => {
    sessionStorage.setItem(REQUEST_KEY, "9");
    expect(readRememberedRequest()).toBeNull();
  });

  it("says the request was kept when storage takes it", () => {
    expect(rememberRequest("1")).toBe(true);
  });

  it("says the request was lost, rather than throwing, when storage refuses", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("storage is blocked");
      },
      setItem: () => {
        throw new Error("storage is blocked");
      },
      removeItem: () => {
        throw new Error("storage is blocked");
      },
    });
    expect(rememberRequest("1")).toBe(false);
    expect(readRememberedRequest()).toBeNull();
    expect(() => forgetRequest()).not.toThrow();
  });
});

describe("the release sequence", () => {
  it("selects the bay, waits, then lands it in the tray", async () => {
    reduceMotion(true);
    const m = machine("owner");
    await runDispense(m, "1");
    expect(m.seen).toEqual(["select", "tray-ready"]);
    expect(m.read().tray).toBe("1");
    expect(m.read().busy).toBe(false);
  });

  it("never lands a locked bay in the tray", async () => {
    reduceMotion(true);
    const m = machine("guest");
    await runDispense(m, "1");
    expect(m.seen).toEqual(["select"]);
    expect(m.read().tray).toBeNull();
    expect(m.read().status).toBe("denied");
  });

  it("shortens under reduced motion without dropping a state change", async () => {
    reduceMotion(true);
    const m = machine("visitor");
    const started = Date.now();
    await runDispense(m, "1");
    expect(Date.now() - started).toBeLessThan(RELEASE_SEQUENCE_MS);
    expect(m.seen).toEqual(["select", "tray-ready"]);
    expect(m.read().tray).toBe("1");
  });

  it("leaves the product in the tray when the bay is pressed twice", async () => {
    reduceMotion(true);
    const m = machine("owner");
    await Promise.all([runDispense(m, "1"), runDispense(m, "1")]);
    expect(m.read().tray).toBe("1");
  });

  it("completes one release for two presses of the same bay", async () => {
    reduceMotion(true);
    const m = machine("owner");
    await Promise.all([runDispense(m, "1"), runDispense(m, "1")]);
    expect(m.seen.filter((type) => type === "tray-ready")).toHaveLength(1);
  });

  it("keeps the first bay when a second bay is pressed mid release", async () => {
    reduceMotion(true);
    const m = machine("owner");
    await Promise.all([runDispense(m, "1"), runDispense(m, "3")]);
    expect(m.read().tray).toBe("1");
  });
});

describe("finishing a release the reducer already began", () => {
  it("lands the requested bay after the pass is accepted", async () => {
    reduceMotion(true);
    const m = machine("guest");
    m.dispatch({ type: "select", bay: "1" });
    m.dispatch({ type: "pass-issued", access: "visitor" });
    expect(m.read().status).toBe("dispensing");
    await runRelease(m);
    expect(m.read().tray).toBe("1");
    expect(m.read().busy).toBe(false);
  });

  it("does nothing when no release is running", async () => {
    reduceMotion(true);
    const m = machine("owner");
    await runRelease(m);
    expect(m.seen).toEqual([]);
    expect(m.read().tray).toBeNull();
  });
});

describe("the reader scan", () => {
  it("holds the machine in reading, then opens the terminal", async () => {
    reduceMotion(true);
    const m = machine("guest");
    const scanning = runReaderScan(m.dispatch);
    expect(m.read().status).toBe("reading");
    await scanning;
    expect(m.seen).toEqual(["pass-tap", "reader-scanned"]);
    expect(m.read().authStep).toBe("methods");
  });

  it("does nothing for a machine that already holds a pass", async () => {
    reduceMotion(true);
    const m = machine("owner");
    await runReaderScan(m.dispatch);
    expect(m.seen).toEqual(["pass-tap"]);
    expect(m.read().status).toBe("idle");
  });
});

describe("the cartridge to screen bridge", () => {
  it("opens the bridge and then leaves for the application", async () => {
    reduceMotion(true);
    const m = machine("owner");
    await runDispense(m, "1");
    const left: BayCode[] = [];
    await runScreenTransfer(m.dispatch, (bay) => left.push(bay));
    expect(m.seen).toEqual(["select", "tray-ready", "activate-tray"]);
    expect(left).toEqual(["1"]);
    expect(m.read().screenTransfer).toBe("1");
  });

  it("cancelling mid bridge leaves the machine where it was", async () => {
    reduceMotion(false);
    const m = machine("owner");
    await runDispense(m, "1");
    const left: BayCode[] = [];
    const controller = new AbortController();
    const bridging = runScreenTransfer(
      m.dispatch,
      (bay) => left.push(bay),
      controller.signal,
    );
    expect(m.read().screenTransfer).toBe("1");
    controller.abort();
    await bridging;
    expect(left).toEqual([]);
    expect(m.read().screenTransfer).toBeNull();
    expect(m.read().busy).toBe(false);
  });

  it("cancels the same way when motion is reduced", async () => {
    reduceMotion(true);
    const m = machine("owner");
    await runDispense(m, "1");
    const left: BayCode[] = [];
    const controller = new AbortController();
    const bridging = runScreenTransfer(
      m.dispatch,
      (bay) => left.push(bay),
      controller.signal,
    );
    controller.abort();
    await bridging;
    expect(left).toEqual([]);
    expect(m.read().screenTransfer).toBeNull();
  });

  it("does not open a bridge from an empty tray", async () => {
    reduceMotion(true);
    const m = machine("owner");
    const left: BayCode[] = [];
    await runScreenTransfer(m.dispatch, (bay) => left.push(bay));
    expect(m.seen).toEqual(["activate-tray"]);
    expect(left).toEqual([]);
    expect(m.read().screenTransfer).toBeNull();
  });
});
