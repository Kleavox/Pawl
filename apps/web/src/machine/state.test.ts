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

describe("leaving for sign-in on paw.", () => {
  it("sends a guest out from the products, busy until the page goes", () => {
    const leaving = reduce(initialState("guest", CATALOG), { type: "sign-in" });
    expect(leaving.authStep).toBe("leaving");
    expect(leaving.status).toBe("idle");
    expect(leaving.busy).toBe(true);
  });

  it("does not leave twice, for a signed-in person, or mid-release", () => {
    const leaving = reduce(initialState("guest", CATALOG), { type: "sign-in" });
    expect(reduce(leaving, { type: "sign-in" })).toBe(leaving);
    const owner = initialState("owner", CATALOG);
    expect(reduce(owner, { type: "sign-in" })).toBe(owner);
    const releasing = reduce(owner, { type: "select", bay: "1" });
    expect(reduce(releasing, { type: "sign-in" })).toBe(releasing);
  });

  it("keeps the refused bay when it leaves, so the bay is released after sign-in", () => {
    const refused = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "1",
    });
    const leaving = reduce(refused, { type: "sign-in" });
    expect(leaving.authStep).toBe("leaving");
    expect(leaving.authRequest).toBe("1");
  });

  it("comes back to the products when the page stays, the bay still remembered", () => {
    const refused = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "1",
    });
    const stayed = reduce(reduce(refused, { type: "sign-in" }), {
      type: "stay",
    });
    expect(stayed.authStep).toBe("closed");
    expect(stayed.busy).toBe(false);
    expect(stayed.authRequest).toBe("1");
    const guest = initialState("guest", CATALOG);
    expect(reduce(guest, { type: "stay" })).toBe(guest);
  });

  it("cannot be put back or stepped back while it leaves", () => {
    const leaving = reduce(initialState("guest", CATALOG), { type: "sign-in" });
    expect(reduce(leaving, { type: "cancel" })).toBe(leaving);
    expect(reduce(leaving, { type: "back" })).toBe(leaving);
  });

  it("opens the account screen only for a signed-in person; Back and Esc return to the products", () => {
    const guest = initialState("guest", CATALOG);
    expect(reduce(guest, { type: "open-account" })).toBe(guest);
    const account = reduce(initialState("owner", CATALOG), {
      type: "open-account",
    });
    expect(account.authStep).toBe("account");
    expect(reduce(account, { type: "back" }).authStep).toBe("closed");
    expect(reduce(account, { type: "cancel" }).authStep).toBe("closed");
  });

  it("has no sign-in steps of its own any more", () => {
    expect(Object.keys(initialState("guest", CATALOG))).not.toContain(
      "authDigits",
    );
    expect(Object.keys(initialState("guest", CATALOG))).not.toContain(
      "authAttemptsLeft",
    );
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

type Status = MachineState["status"];
type AuthStep = MachineState["authStep"];

const ALL_STATUSES: Record<Status, true> = {
  idle: true,
  granted: true,
  selected: true,
  denied: true,
  dispensing: true,
};

const ALL_AUTH_STEPS: Record<AuthStep, true> = {
  closed: true,
  leaving: true,
  account: true,
};

describe("every declared state is reachable", () => {
  it("produces every status value from some event sequence", () => {
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
    const leaving = reduce(initialState("guest", CATALOG), { type: "sign-in" });
    const account = reduce(initialState("owner", CATALOG), {
      type: "open-account",
    });
    const observed = new Set<AuthStep>([
      initialState("guest", CATALOG).authStep,
      leaving.authStep,
      account.authStep,
    ]);
    for (const step of Object.keys(ALL_AUTH_STEPS) as AuthStep[]) {
      expect(observed.has(step)).toBe(true);
    }
  });
});

describe("stepping back", () => {
  it("does nothing on the products", () => {
    const guest = initialState("guest", CATALOG);
    expect(reduce(guest, { type: "back" })).toBe(guest);
  });
});

const CARDED = [
  ...CATALOG,
  {
    ...CATALOG[0]!,
    code: "5",
    key: "dns",
    product: "DNS",
    title: "DNS",
    estate: false,
    href: "https://enroll.elsewhere.test",
    card: true,
  },
];

function delivered(bay: string, catalog = CARDED): MachineState {
  return { ...initialState("visitor", catalog), tray: bay };
}

describe("a card instead of a trip", () => {
  it("opens the delivered app's card in place of the bridge", () => {
    const next = reduce(delivered("5"), { type: "open-card" });
    expect(next.card).toBe("5");
    expect(next.tray).toBeNull();
    expect(next.screenTransfer).toBeNull();
    expect(next.busy).toBe(false);
  });

  it("opens no card for an app without one, or with nothing delivered", () => {
    const plain = delivered("3");
    expect(reduce(plain, { type: "open-card" })).toBe(plain);
    const empty = initialState("visitor", CARDED);
    expect(reduce(empty, { type: "open-card" })).toBe(empty);
  });

  it("goes back to the bays from the card on back, cancel and reset", () => {
    const open = reduce(delivered("5"), { type: "open-card" });
    for (const event of [
      { type: "back" },
      { type: "cancel" },
      { type: "close-card" },
      { type: "reset" },
    ] as const) {
      expect(reduce(open, event).card, event.type).toBeNull();
    }
  });

  it("forgets the card when the pass is removed", () => {
    const open = reduce(delivered("5"), { type: "open-card" });
    expect(reduce(open, { type: "pass-removed" }).card).toBeNull();
  });
});

describe("a catalog that arrives after the page", () => {
  it("takes the new bays while the machine is idle", () => {
    const next = reduce(initialState("visitor", CATALOG), {
      type: "catalog",
      catalog: CARDED,
    });
    expect(next.catalog).toBe(CARDED);
  });

  it("waits while the machine is busy, and lets go of a bay that left", () => {
    const busy = { ...initialState("visitor", CATALOG), busy: true };
    expect(reduce(busy, { type: "catalog", catalog: CARDED })).toBe(busy);
    const holding = { ...delivered("5"), selection: "5" };
    const after = reduce(holding, { type: "catalog", catalog: CATALOG });
    expect(after.catalog).toBe(CATALOG);
    expect(after.tray).toBeNull();
    expect(after.selection).toBeNull();
  });
});
