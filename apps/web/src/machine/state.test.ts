import { describe, expect, it } from "vitest";
import { initialState, permits, reduce } from "./state";
import type { MachineState } from "./state";
import { CATALOG } from "./catalog.testkit";

describe("who may take a bay", () => {
  it("derives who may take a bay from the catalog, not a table of its own", () => {
    expect(permits("guest", "1", CATALOG)).toBe(false);
    expect(permits("visitor", "1", CATALOG)).toBe(true);
    expect(permits("guest", "3", CATALOG)).toBe(true);
    expect(permits("owner", "9", CATALOG)).toBe(false);
  });

  it("keeps an owner-only bay from a visitor", () => {
    const owned = [{ ...CATALOG[0]!, access: "owner" as const }];
    expect(permits("visitor", "1", owned)).toBe(false);
    expect(permits("owner", "1", owned)).toBe(true);
  });
});

describe("selection policy", () => {
  it("sends a guest who picks NOTE to pass required and remembers the bay", () => {
    const next = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "1",
    });
    expect(next.status).toBe("denied");
    expect(next.authRequest).toBe("1");
  });

  it("lets a guest take MANUAL without a pass", () => {
    const next = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "3",
    });
    expect(next.status).toBe("dispensing");
  });
});

describe("keypad preselect", () => {
  it("selects a bay and waits without dispensing", () => {
    const next = reduce(initialState("owner", CATALOG), {
      type: "preselect",
      bay: "1",
    });
    expect(next.status).toBe("selected");
    expect(next.selection).toBe("1");
    expect(next.busy).toBe(false);
  });

  it("is ignored while a sequence is busy", () => {
    const dispensing = reduce(initialState("owner", CATALOG), {
      type: "select",
      bay: "1",
    });
    const again = reduce(dispensing, { type: "preselect", bay: "3" });
    expect(again.selection).toBe("1");
    expect(again.status).toBe("dispensing");
  });
});

describe("resuming a locked request", () => {
  it("dispenses the remembered bay as soon as the pass is issued", () => {
    const denied = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "1",
    });
    const granted = reduce(denied, { type: "pass-issued", access: "visitor" });
    expect(granted.status).toBe("dispensing");
    expect(granted.selection).toBe("1");
    expect(granted.authRequest).toBeNull();
  });
});

describe("the sign-in terminal steps", () => {
  it("pass-tap starts the reader", () => {
    const tapped = reduce(initialState("guest", CATALOG), { type: "pass-tap" });
    expect(tapped.status).toBe("reading");
    expect(tapped.busy).toBe(true);
    expect(tapped.authStep).toBe("closed");
  });

  it("reader-scanned opens the method screen once the scan finishes", () => {
    const tapped = reduce(initialState("guest", CATALOG), { type: "pass-tap" });
    const scanned = reduce(tapped, { type: "reader-scanned" });
    expect(scanned.authStep).toBe("methods");
    expect(scanned.busy).toBe(true);
  });

  it("reader-scanned is ignored if the card was never tapped", () => {
    const guest = initialState("guest", CATALOG);
    const ignored = reduce(guest, { type: "reader-scanned" });
    expect(ignored).toEqual(guest);
  });

  it("reader-scanned is a no-op once the terminal is already open", () => {
    const scanned = reduce(
      reduce(initialState("guest", CATALOG), { type: "pass-tap" }),
      {
        type: "reader-scanned",
      },
    );
    const again = reduce(scanned, { type: "reader-scanned" });
    expect(again).toEqual(scanned);
  });

  it("otp-sent moves the keypad into code entry", () => {
    const scanned = reduce(
      reduce(initialState("guest", CATALOG), { type: "pass-tap" }),
      {
        type: "reader-scanned",
      },
    );
    const sent = reduce(scanned, { type: "otp-sent" });
    expect(sent.authStep).toBe("otp-machine");
    expect(sent.busy).toBe(true);
  });

  it("otp-sent is ignored if the terminal was never opened", () => {
    const guest = initialState("guest", CATALOG);
    const ignored = reduce(guest, { type: "otp-sent" });
    expect(ignored).toEqual(guest);
  });

  it("oauth-started marks the redirect about to happen", () => {
    const scanned = reduce(
      reduce(initialState("guest", CATALOG), { type: "pass-tap" }),
      {
        type: "reader-scanned",
      },
    );
    const started = reduce(scanned, { type: "oauth-started" });
    expect(started.authStep).toBe("oauth");
    expect(started.busy).toBe(true);
  });

  it("oauth-started cannot fire once otp-sent already claimed the step", () => {
    const scanned = reduce(
      reduce(initialState("guest", CATALOG), { type: "pass-tap" }),
      {
        type: "reader-scanned",
      },
    );
    const sent = reduce(scanned, { type: "otp-sent" });
    const started = reduce(sent, { type: "oauth-started" });
    expect(started).toEqual(sent);
  });

  it("verifying moves an in-flight code check to issuing", () => {
    const scanned = reduce(
      reduce(initialState("guest", CATALOG), { type: "pass-tap" }),
      {
        type: "reader-scanned",
      },
    );
    const sent = reduce(scanned, { type: "otp-sent" });
    const verifying = reduce(sent, { type: "verifying" });
    expect(verifying.authStep).toBe("issuing");
    expect(verifying.busy).toBe(true);
  });

  it("verifying moves an in-flight oauth callback to issuing", () => {
    const scanned = reduce(
      reduce(initialState("guest", CATALOG), { type: "pass-tap" }),
      {
        type: "reader-scanned",
      },
    );
    const started = reduce(scanned, { type: "oauth-started" });
    const verifying = reduce(started, { type: "verifying" });
    expect(verifying.authStep).toBe("issuing");
  });

  it("verifying is ignored before a code or callback is in flight", () => {
    const guest = initialState("guest", CATALOG);
    const ignored = reduce(guest, { type: "verifying" });
    expect(ignored).toEqual(guest);
  });
});

describe("cancelling the bridge", () => {
  it("returns the cartridge to the tray and leaves it openable", () => {
    const owner = initialState("owner", CATALOG);
    const dispensing = reduce(owner, { type: "select", bay: "1" });
    const ready = reduce(dispensing, { type: "tray-ready" });
    const bridging = reduce(ready, { type: "activate-tray" });
    const cancelled = reduce(bridging, { type: "cancel" });
    expect(cancelled.screenTransfer).toBeNull();
    expect(cancelled.tray).toBe("1");
    expect(cancelled.busy).toBe(false);
  });
});

describe("CLR before GO", () => {
  it("puts a picked bay back, so the screen returns to the estate line", () => {
    const owner = initialState("owner", CATALOG);
    const picked = reduce(owner, { type: "preselect", bay: "1" });
    const cleared = reduce(picked, { type: "cancel" });
    expect(cleared.selection).toBeNull();
    expect(cleared.status).toBe("idle");
  });

  it("puts a refused bay back and forgets it, so the screen stops saying denied", () => {
    const refused = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "1",
    });
    const cleared = reduce(refused, { type: "cancel" });
    expect(cleared.status).toBe("idle");
    expect(cleared.selection).toBeNull();
    expect(cleared.authRequest).toBeNull();
  });

  it("cannot pull back a bay that is already dropping, so the tray gets the bay that was paid for", () => {
    const owner = initialState("owner", CATALOG);
    const dropping = reduce(owner, { type: "select", bay: "1" });
    const cleared = reduce(dropping, { type: "cancel" });
    expect(cleared).toBe(dropping);
    expect(reduce(cleared, { type: "preselect", bay: "3" }).selection).toBe(
      "1",
    );
  });

  it("cannot back out of a sign-in that is already being verified", () => {
    const guest = initialState("guest", CATALOG);
    const reading = reduce(guest, { type: "pass-tap" });
    expect(reduce(reading, { type: "cancel" })).toBe(reading);
    const methods = reduce(reading, { type: "reader-scanned" });
    const sent = reduce(methods, { type: "otp-sent" });
    const issuing = reduce(sent, { type: "verifying" });
    expect(reduce(issuing, { type: "cancel" })).toBe(issuing);
  });
});

describe("opening the bridge", () => {
  it("refuses a second bridge while one is already open", () => {
    const owner = initialState("owner", CATALOG);
    const dispensing = reduce(owner, { type: "select", bay: "1" });
    const ready = reduce(dispensing, { type: "tray-ready" });
    const bridging = reduce(ready, { type: "activate-tray" });
    const again = reduce(bridging, { type: "activate-tray" });
    expect(again).toBe(bridging);
  });
});

describe("tapping out", () => {
  it("returns a visitor to guest and clears the tray", () => {
    const visitor = initialState("visitor", CATALOG);
    const out = reduce(visitor, { type: "pass-removed" });
    expect(out.access).toBe("guest");
    expect(out.tray).toBeNull();
    expect(out.status).toBe("idle");
  });
});

describe("busy", () => {
  it("ignores a second selection while a sequence runs", () => {
    const owner = initialState("owner", CATALOG);
    const dispensing = reduce(owner, { type: "select", bay: "1" });
    const again = reduce(dispensing, { type: "select", bay: "3" });
    expect(again.selection).toBe("1");
  });
});

describe("a machine put back after a fault", () => {
  it("returns the machine to idle instead of hanging on busy", () => {
    const owner = initialState("owner", CATALOG);
    const dispensing = reduce(owner, { type: "select", bay: "1" });
    const failed = reduce(dispensing, { type: "reset" });
    expect(failed.status).toBe("idle");
    expect(failed.busy).toBe(false);
    expect(failed.tray).toBeNull();
  });

  it("keeps the bay a guest was denied, so a later pass still opens it", () => {
    const guest = initialState("guest", CATALOG);
    const denied = reduce(guest, { type: "select", bay: "1" });
    expect(denied.authRequest).toBe("1");
    const recovered = reduce(denied, { type: "reset" });
    expect(recovered.authRequest).toBe("1");
    expect(
      reduce(recovered, { type: "pass-issued", access: "visitor" }).status,
    ).toBe("dispensing");
  });
});

describe("the otp buffer belongs to the reducer", () => {
  it("holds the digits the keypad reports", () => {
    const guest = initialState("guest", CATALOG);
    const typing = reduce(guest, { type: "otp-digits", digits: "2468" });
    expect(typing.authDigits).toBe("2468");
  });

  it("empties the buffer when the pass is issued", () => {
    const typing = reduce(initialState("guest", CATALOG), {
      type: "otp-digits",
      digits: "246810",
    });
    const granted = reduce(typing, { type: "pass-issued", access: "visitor" });
    expect(granted.authDigits).toBe("");
  });
});

describe("a rejected email code", () => {
  it("records how many tries are left and empties the buffer", () => {
    const sent = reduce(
      reduce(reduce(initialState("guest", CATALOG), { type: "pass-tap" }), {
        type: "reader-scanned",
      }),
      { type: "otp-sent" },
    );
    const typed = reduce(sent, { type: "otp-digits", digits: "123456" });
    const rejected = reduce(typed, { type: "otp-rejected", attemptsLeft: 2 });
    expect(rejected.authAttemptsLeft).toBe(2);
    expect(rejected.authDigits).toBe("");
    expect(rejected.authStep).toBe("otp-machine");
  });

  it("is ignored when the keypad is not taking a code", () => {
    const guest = initialState("guest", CATALOG);
    expect(reduce(guest, { type: "otp-rejected", attemptsLeft: 2 })).toEqual(
      guest,
    );
  });

  it("is forgotten once the pass is issued", () => {
    const sent = reduce(
      reduce(reduce(initialState("guest", CATALOG), { type: "pass-tap" }), {
        type: "reader-scanned",
      }),
      { type: "otp-sent" },
    );
    const rejected = reduce(sent, { type: "otp-rejected", attemptsLeft: 1 });
    const issued = reduce(rejected, {
      type: "pass-issued",
      access: "visitor",
    });
    expect(issued.authAttemptsLeft).toBeNull();
    expect(reduce(rejected, { type: "cancel" }).authAttemptsLeft).toBeNull();
  });
});

type Status = MachineState["status"];
type AuthStep = MachineState["authStep"];

const ALL_STATUSES: Record<Status, true> = {
  idle: true,
  reading: true,
  granted: true,
  selected: true,
  denied: true,
  dispensing: true,
};

const ALL_AUTH_STEPS: Record<AuthStep, true> = {
  closed: true,
  methods: true,
  "otp-machine": true,
  oauth: true,
  issuing: true,
};

describe("every declared state is reachable", () => {
  it("produces every status value from some event sequence", () => {
    const tapped = reduce(initialState("guest", CATALOG), { type: "pass-tap" });
    const preselected = reduce(initialState("owner", CATALOG), {
      type: "preselect",
      bay: "1",
    });
    const denied = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "1",
    });
    const dispensing = reduce(initialState("owner", CATALOG), {
      type: "select",
      bay: "1",
    });
    const granted = reduce(initialState("guest", CATALOG), {
      type: "pass-issued",
      access: "visitor",
    });

    const observed = new Set<Status>([
      initialState("guest", CATALOG).status,
      tapped.status,
      preselected.status,
      denied.status,
      dispensing.status,
      granted.status,
    ]);

    for (const status of Object.keys(ALL_STATUSES) as Status[]) {
      expect(observed.has(status)).toBe(true);
    }
  });

  it("produces every authStep value from some event sequence", () => {
    const scanned = reduce(
      reduce(initialState("guest", CATALOG), { type: "pass-tap" }),
      {
        type: "reader-scanned",
      },
    );
    const otpSent = reduce(scanned, { type: "otp-sent" });
    const oauthStarted = reduce(scanned, { type: "oauth-started" });
    const issuingFromOtp = reduce(otpSent, { type: "verifying" });

    const observed = new Set<AuthStep>([
      initialState("guest", CATALOG).authStep,
      scanned.authStep,
      otpSent.authStep,
      oauthStarted.authStep,
      issuingFromOtp.authStep,
    ]);

    for (const step of Object.keys(ALL_AUTH_STEPS) as AuthStep[]) {
      expect(observed.has(step)).toBe(true);
    }
  });
});

describe("stepping back from the code to the email", () => {
  it("returns to the sign-in methods with the code forgotten", () => {
    const guest = initialState("guest", CATALOG);
    const reading = reduce(guest, { type: "pass-tap" });
    const methods = reduce(reading, { type: "reader-scanned" });
    const sent = reduce(methods, { type: "otp-sent" });
    const typed = reduce(sent, { type: "otp-digits", digits: "123" });
    const rejected = reduce(typed, { type: "otp-rejected", attemptsLeft: 3 });
    const back = reduce(rejected, { type: "otp-back" });
    expect(back.authStep).toBe("methods");
    expect(back.authDigits).toBe("");
    expect(back.authAttemptsLeft).toBeNull();
  });

  it("does nothing outside the code view", () => {
    const guest = initialState("guest", CATALOG);
    expect(reduce(guest, { type: "otp-back" })).toBe(guest);
  });
});
