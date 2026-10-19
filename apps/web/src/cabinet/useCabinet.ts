import { REQUEST_TIMEOUT_MS, type Identity } from "@pawl/core";
import type { PublicView } from "@pawl/registry";
import {
  arrivalFraming,
  leave,
  settle,
  shouldAnimateClick,
  useCameraArrival,
  useFollowFocus,
  useMachineKeys,
  useScanWipe,
  withCamHint,
  type Overview,
} from "@pawl/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import { signOut, silentSignInPath } from "../auth-client";
import { toMachineModel, type MachineModel } from "../estate-adapter";
import { litKeys, productOf, viewFor, type ScreenCopy } from "../machine/copy";
import { createKeypad } from "../machine/keypad";
import {
  forgetRequest,
  readRememberedRequest,
  rememberRequest,
  runDispense,
  runRelease,
  runScreenTransfer,
} from "../machine/sequence";
import {
  initialState,
  reduce,
  type BayCode,
  type Catalog,
  type MachineEvent,
  type MachineHost,
  type MachineState,
} from "../machine/state";
import { useSound } from "../sound";
import { cardStep, readCardFor, type AppCard, type CardState } from "./card";
import { signInHref } from "./sign-in";

type GatewaySession = {
  authenticated: boolean;
  identity?: Identity;
  reason?: string;
};

const FAULT_HOLD_MS = 2000;
const PASS_WAIT_MS = 4000;
const TICKER_SPEED = 40;
const COPIED_MS = 1500;
const SIGNED_OUT_KEY = "pawl:signed-out";
const SIGN_IN_UNFINISHED = "SIGN-IN DID NOT FINISH";

function asked(): RequestInit {
  return {
    credentials: "include",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

function signInUnfinished(): boolean {
  const query = new URLSearchParams(window.location.search);
  if (query.get("signin") !== "failed") return false;
  query.delete("signin");
  const search = query.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
  );
  return true;
}

async function readCatalog(): Promise<Catalog | null> {
  try {
    const response = await fetch("/api/catalog", asked());
    if (!response.ok) return null;
    const body = (await response.json()) as { bays?: unknown };
    return Array.isArray(body.bays) ? (body.bays as Catalog) : null;
  } catch {
    return null;
  }
}

function sameCatalog(a: Catalog, b: Catalog): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function hold(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "The machine could not complete that.";
}

async function readSession(): Promise<GatewaySession> {
  const response = await fetch("/api/session", asked());
  if (!response.ok) {
    throw new Error(`The pass office answered ${response.status}.`);
  }
  return (await response.json()) as GatewaySession;
}

async function readEstate(): Promise<Overview | null> {
  try {
    const response = await fetch("/api/estate", asked());
    if (!response.ok) return null;
    return (await response.json()) as Overview;
  } catch {
    return null;
  }
}

function deferred(): {
  read: Promise<void>;
  settled: boolean;
  done: () => void;
} {
  let resolve!: () => void;
  const read = new Promise<void>((settle) => (resolve = settle));
  const gate = {
    read,
    settled: false,
    done: () => {
      gate.settled = true;
      resolve();
    },
  };
  return gate;
}

function signedOutJustNow(): boolean {
  try {
    const was = sessionStorage.getItem(SIGNED_OUT_KEY) === "1";
    sessionStorage.removeItem(SIGNED_OUT_KEY);
    return was;
  } catch {
    return false;
  }
}

function markSignedOut(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(SIGNED_OUT_KEY, "1");
    else sessionStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    return;
  }
}

export function useCabinet(input: {
  site: PublicView;
  passHref: string;
  navigate: (url: string) => void;
}) {
  const { site, passHref, navigate } = input;
  const catalogRef = useRef<Catalog>(site.bays);
  const toolKeys = useMemo(() => site.tools.map((tool) => tool.key), [site]);
  const modelFor = useCallback(
    (session: GatewaySession, overview: Overview | null): MachineModel =>
      toMachineModel(
        session,
        overview,
        catalogRef.current,
        toolKeys,
        site.site.name,
      ),
    [toolKeys, site],
  );

  const stateRef = useRef<MachineState>(initialState("guest", site.bays));
  const [state, setState] = useState(stateRef.current);
  const modelRef = useRef<MachineModel>(
    modelFor({ authenticated: false }, null),
  );
  const [model, setModelState] = useState(modelRef.current);
  const faultRef = useRef<string | null>(null);
  const [fault, setFaultState] = useState<string | null>(null);
  const [said, setSaid] = useState<{ view: string; text: string }>({
    view: "products",
    text: "",
  });
  const [lcd, setLcd] = useState<ScreenCopy | null>(null);
  const [leaving, setLeaving] = useState<"sign-in" | "manage" | "card" | null>(
    null,
  );
  const cardRef = useRef<CardState>({ kind: "closed" });
  const [card, setCardState] = useState<CardState>(cardRef.current);
  const [copied, setCopied] = useState<string | null>(null);

  const camera = useRef<HTMLDivElement>(null);
  const machine = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const ticker = useRef<HTMLSpanElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const keypad = useRef(createKeypad(site.bays.map((bay) => bay.code)));
  const bridging = useRef<AbortController | null>(null);
  const retrying = useRef(false);
  const sound = useSound();

  const [passRead] = useState(deferred);

  const setModel = useCallback((next: MachineModel): void => {
    modelRef.current = next;
    setModelState(next);
  }, []);

  const setFault = useCallback((next: string | null): void => {
    faultRef.current = next;
    setFaultState(next);
  }, []);

  const dispatch = useCallback(
    (event: MachineEvent): MachineState => {
      setFault(null);
      stateRef.current = reduce(stateRef.current, event);
      setState(stateRef.current);
      return stateRef.current;
    },
    [setFault],
  );

  const host = useMemo<MachineHost>(
    () => ({ read: () => stateRef.current, dispatch }),
    [dispatch],
  );

  const raiseFault = useCallback(
    (words: string): void => {
      stateRef.current = reduce(stateRef.current, { type: "reset" });
      setState(stateRef.current);
      setFault(words);
    },
    [setFault],
  );

  const say = useCallback((text: string): void => {
    setSaid({ view: viewFor(stateRef.current), text });
  }, []);

  const applyCatalog = useCallback(
    (next: Catalog | null): void => {
      if (next === null || sameCatalog(next, catalogRef.current)) return;
      catalogRef.current = next;
      keypad.current = createKeypad(next.map((bay) => bay.code));
      dispatch({ type: "catalog", catalog: next });
    },
    [dispatch],
  );

  const showCard = useCallback((next: CardState): void => {
    cardRef.current = next;
    setCardState(next);
  }, []);

  const loadCard = useCallback(
    async (bay: BayCode): Promise<void> => {
      const entry = catalogRef.current.find(
        (candidate) => candidate.code === bay,
      );
      if (entry === undefined) return;
      showCard({ kind: "loading" });
      const next = await readCardFor(entry.key);
      if (stateRef.current.card !== bay) return;
      showCard(next);
      if (next.kind === "expired") {
        rememberRequest(bay);
        navigate(silentSignInPath(window.location));
      }
    },
    [showCard, navigate],
  );

  const closeCard = useCallback((): void => {
    dispatch({ type: "close-card" });
    showCard({ kind: "closed" });
    setCopied(null);
  }, [dispatch, showCard]);

  const keepRequest = useCallback((): boolean => {
    const wanted = stateRef.current.authRequest;
    if (wanted === null || rememberRequest(wanted)) return true;
    say(
      "This browser cannot hold your bay request. Sign in, then pick the bay again.",
    );
    return false;
  }, [say]);

  const framingNow = useCallback(
    () => arrivalFraming(`#cam=${camera.current?.dataset.framing ?? ""}`),
    [],
  );

  const handBack = useCallback((): void => {
    if (machine.current !== null) delete machine.current.dataset.leaving;
    setLeaving(null);
    setLcd(null);
    if (stateRef.current.authStep === "leaving") dispatch({ type: "stay" });
  }, [dispatch]);

  const comeBack = useCallback((): void => {
    handBack();
    if (camera.current !== null)
      void settle(camera.current, framingNow(), "whole");
  }, [handBack, framingNow]);

  const leaveForSignIn = useCallback(async (): Promise<void> => {
    if (stateRef.current.authStep === "leaving") return;
    if (!keepRequest()) await hold(FAULT_HOLD_MS);
    const next = dispatch({ type: "sign-in" });
    if (next.authStep !== "leaving" || camera.current === null) return;
    setLeaving("sign-in");
    void leave(
      camera.current,
      "screen",
      withCamHint(signInHref(passHref, window.location), "screen"),
      { go: navigate, stay: comeBack },
    );
  }, [keepRequest, dispatch, passHref, navigate, comeBack]);

  const depart = useCallback(
    (
      event: MouseEvent<HTMLAnchorElement> | globalThis.MouseEvent,
      href: string,
      to: "printer" | "screen",
      words: string,
    ): void => {
      if (
        camera.current === null ||
        !shouldAnimateClick(event as globalThis.MouseEvent)
      ) {
        return;
      }
      event.preventDefault();
      if (to === "printer" && machine.current !== null) {
        machine.current.dataset.leaving = "printer";
      } else {
        setLeaving("manage");
      }
      setLcd({ main: words, sub: "ONE MOMENT" });
      void leave(camera.current, to, withCamHint(href, to), {
        go: navigate,
        stay: comeBack,
      });
    },
    [navigate, comeBack],
  );

  const leaveFromCard = useCallback(
    (event: MouseEvent<HTMLAnchorElement> | null): void => {
      const bay = stateRef.current.card;
      const step = cardStep(cardRef.current);
      if (bay === null || step?.kind !== "leave") return;
      if (
        event !== null &&
        !shouldAnimateClick(event as unknown as globalThis.MouseEvent)
      ) {
        return;
      }
      event?.preventDefault();
      const connecting = cardRef.current.kind === "connect";
      if (connecting && !rememberRequest(bay)) {
        say(
          "This browser cannot hold your bay request. Pick the bay again after connecting.",
        );
      }
      const href = connecting ? withCamHint(step.href, "screen") : step.href;
      setLeaving("card");
      setLcd({
        main: connecting
          ? "OPENING PAWL"
          : `OPENING ${productOf(catalogRef.current, bay)}`,
        sub: "ONE MOMENT",
      });
      if (camera.current === null) {
        navigate(href);
        return;
      }
      void leave(camera.current, "screen", href, {
        go: navigate,
        stay: comeBack,
      });
    },
    [navigate, comeBack, say],
  );

  const signInFromCard = useCallback((): void => {
    const bay = stateRef.current.card;
    if (bay !== null) rememberRequest(bay);
    navigate(silentSignInPath(window.location));
  }, [navigate]);

  const copyField = useCallback(
    (field: AppCard["fields"][number]): void => {
      const failed = (): void =>
        say("Copy did not work here. Select the text and copy it yourself.");
      const clipboard = globalThis.navigator?.clipboard;
      if (clipboard === undefined) {
        failed();
        return;
      }
      clipboard.writeText(field.value).then(() => {
        setCopied(field.label);
        setTimeout(
          () => setCopied((now) => (now === field.label ? null : now)),
          COPIED_MS,
        );
      }, failed);
    },
    [say],
  );

  const runCardGo = useCallback((): void => {
    const step = cardStep(cardRef.current);
    const bay = stateRef.current.card;
    if (step === null || bay === null) return;
    if (step.kind === "leave") leaveFromCard(null);
    else if (step.kind === "retry") void loadCard(bay);
    else signInFromCard();
  }, [leaveFromCard, loadCard, signInFromCard]);

  const dispense = useCallback(
    async (bay: BayCode): Promise<void> => {
      if (!passRead.settled) {
        await Promise.race([passRead.read, hold(PASS_WAIT_MS)]);
      }
      try {
        await runDispense(host, bay, () => {
          void leaveForSignIn();
        });
      } catch {
        raiseFault("RELEASE FAILED, TRY AGAIN");
      }
    },
    [host, leaveForSignIn, raiseFault, passRead],
  );

  const resumeRemembered = useCallback(async (): Promise<void> => {
    const bay = readRememberedRequest(
      catalogRef.current.map((entry) => entry.code),
    );
    if (bay === null) return;
    forgetRequest();
    await dispense(bay);
  }, [dispense]);

  const estateUnread = useCallback(
    (): boolean =>
      (faultRef.current ?? modelRef.current.screen).includes("UNREADABLE"),
    [],
  );

  const retryEstate = useCallback(async (): Promise<void> => {
    if (retrying.current) return;
    retrying.current = true;
    try {
      let session: GatewaySession;
      try {
        session = await readSession();
      } catch {
        raiseFault("SESSION STILL UNREADABLE");
        return;
      }
      if (!session.authenticated && session.reason === "expired") {
        if (!keepRequest()) await hold(FAULT_HOLD_MS);
        navigate(silentSignInPath(window.location));
        return;
      }
      const overview = session.authenticated ? await readEstate() : null;
      const next = modelFor(session, overview);
      setModel(next);
      if (next.access === "guest") {
        forgetRequest();
        dispatch({ type: "pass-removed" });
        return;
      }
      dispatch({ type: "pass-issued", access: next.access });
      if (next.screen.includes("UNREADABLE")) {
        raiseFault("ESTATE STILL UNREADABLE");
        return;
      }
      dispatch({ type: "reset" });
      await resumeRemembered();
    } finally {
      retrying.current = false;
    }
  }, [
    raiseFault,
    keepRequest,
    navigate,
    modelFor,
    setModel,
    dispatch,
    resumeRemembered,
  ]);

  const release = useCallback(async (): Promise<void> => {
    try {
      await runRelease(host);
    } catch {
      raiseFault("RELEASE FAILED, TRY AGAIN");
    }
  }, [host, raiseFault]);

  const takeDelivery = useCallback(async (): Promise<void> => {
    if (bridging.current !== null) return;
    const delivered = stateRef.current.tray;
    if (
      delivered !== null &&
      catalogRef.current.find((entry) => entry.code === delivered)?.card
    ) {
      const next = dispatch({ type: "open-card" });
      if (next.card === delivered) await loadCard(delivered);
      return;
    }
    const controller = new AbortController();
    bridging.current = controller;
    try {
      await runScreenTransfer(
        dispatch,
        (bay) =>
          navigate(
            machine.current?.querySelector<HTMLElement>(
              `[data-cartridge="${bay}"]`,
            )?.dataset.href ??
              catalogRef.current.find((entry) => entry.code === bay)?.href ??
              "/",
          ),
        controller.signal,
      );
    } catch {
      raiseFault("BRIDGE FAILED, RELEASE IT AGAIN");
    } finally {
      if (bridging.current === controller) bridging.current = null;
    }
    if (stateRef.current.screenTransfer === null) {
      machine.current
        ?.querySelector<HTMLElement>("[data-tray-action]")
        ?.focus({ preventScroll: true });
    }
  }, [dispatch, navigate, loadCard, raiseFault]);

  const cancelBridge = useCallback((): void => {
    if (bridging.current !== null) {
      bridging.current.abort();
      return;
    }
    dispatch({ type: "cancel" });
    machine.current
      ?.querySelector<HTMLElement>("[data-tray-action]")
      ?.focus({ preventScroll: true });
  }, [dispatch]);

  const pressKey = useCallback(
    async (key: string): Promise<void> => {
      sound.click();
      const now = stateRef.current;
      if (now.authStep === "account") {
        if (key === "CLR") dispatch({ type: "back" });
        return;
      }
      if (now.authStep === "leaving") return;
      if (now.card !== null) {
        if (key === "CLR") closeCard();
        if (key === "GO") runCardGo();
        return;
      }
      const result = keypad.current.press(key);
      if (key === "GO" && result.kind === "ignored" && estateUnread()) {
        await retryEstate();
        return;
      }
      if (result.kind === "selected") {
        dispatch({ type: "preselect", bay: result.bay });
        return;
      }
      if (result.kind === "confirm") {
        await dispense(result.bay);
        return;
      }
      if (result.kind === "cancelled" || key === "CLR") {
        dispatch({ type: "cancel" });
      }
    },
    [
      sound,
      dispatch,
      estateUnread,
      retryEstate,
      dispense,
      closeCard,
      runCardGo,
    ],
  );

  const logout = useCallback((): void => {
    markSignedOut(true);
    signOut().catch(() => {
      markSignedOut(false);
      raiseFault("SIGN-OUT FAILED, TRY AGAIN");
    });
  }, [raiseFault]);

  useEffect(() => {
    let cancelled = false;
    const unfinished = signInUnfinished();
    void (async () => {
      const estate = readEstate();
      const [read, fetched] = await Promise.all([
        readSession().then(
          (value) => value,
          () => null,
        ),
        readCatalog(),
      ]);
      if (cancelled) return;
      applyCatalog(fetched);
      const unread = read === null;
      const session: GatewaySession = read ?? { authenticated: false };
      const overview = session.authenticated ? await estate : null;
      if (cancelled) return;
      let next = modelFor(session, overview);
      if (unread) {
        next = {
          ...next,
          screen: "SESSION UNREADABLE",
          ticker: "SESSION UNREADABLE · PRESS GO TO RETRY",
        };
      }
      if (next.access === "guest") {
        if (!unread) forgetRequest();
        if (signedOutJustNow()) {
          next = {
            ...next,
            screen: "SIGNED OUT",
            ticker: `SIGNED OUT · ${next.ticker}`,
          };
        }
        setModel(next);
        passRead.done();
        if (unfinished) setFault(SIGN_IN_UNFINISHED);
        return;
      }
      signedOutJustNow();
      setModel(next);
      dispatch({ type: "pass-issued", access: next.access });
      dispatch({ type: "reset" });
      passRead.done();
      await resumeRemembered();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const recheck = (): void => {
      if (document.visibilityState === "hidden" || !passRead.settled) return;
      void readSession().then(
        (session) => {
          const ended = !session.authenticated && session.reason === "expired";
          if (
            ended ||
            modelFor(session, null).access !== modelRef.current.access
          ) {
            void retryEstate();
          }
        },
        () => undefined,
      );
    };
    const shown = (event: PageTransitionEvent): void => {
      if (event.persisted) recheck();
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("pageshow", shown);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("pageshow", shown);
    };
  }, [passRead, modelFor, retryEstate]);

  useEffect(() => {
    const plate = machine.current;
    if (plate === null) return;
    const click = (event: globalThis.MouseEvent): void => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>(".plate__links a")
          : null;
      if (link === null) return;
      depart(event, link.href, "printer", "PRINTING RECEIPT");
    };
    plate.addEventListener("click", click);
    return () => plate.removeEventListener("click", click);
  }, [depart]);

  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (stateRef.current.card !== null) {
        event.preventDefault();
        closeCard();
        return;
      }
      if (stateRef.current.authStep !== "account") return;
      event.preventDefault();
      dispatch({ type: "cancel" });
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [dispatch, closeCard]);

  useEffect(() => {
    const text = ticker.current;
    const frame = text?.parentElement;
    if (!text || !frame) return;
    text.removeAttribute("data-scroll");
    const travel = text.scrollWidth - frame.clientWidth;
    if (travel <= 0) return;
    text.style.setProperty("--pw-ticker-travel", `${-travel}px`);
    text.style.setProperty(
      "--pw-ticker-time",
      `${Math.max(6, (travel / TICKER_SPEED) * 1.6).toFixed(1)}s`,
    );
    void text.offsetWidth;
    text.dataset.scroll = "once";
  }, [model.ticker]);

  const view = viewFor(state);
  const arrived = useCameraArrival(camera, "whole", { onRestore: handBack });
  useScanWipe(screen, view, arrived === "screen");
  useFollowFocus(screen, view, returnTo);
  const lit = litKeys(
    state,
    fault ?? model.screen,
    fault !== null,
    cardStep(card) !== null,
  );
  useMachineKeys((key) => void pressKey(key), lit);

  return {
    state,
    model,
    fault,
    said: said.view === view ? said.text : "",
    lcd,
    leaving,
    sound,
    card,
    copied,
    refs: { camera, machine, screen, ticker },
    onProductsFocus: (target: HTMLElement) => {
      returnTo.current = target;
    },
    on: {
      key: (key: string) => void pressKey(key),
      tile: (bay: BayCode) => void dispense(bay),
      signIn: () => void leaveForSignIn(),
      account: () => dispatch({ type: "open-account" }),
      back: () => dispatch({ type: "back" }),
      manage: (event: MouseEvent<HTMLAnchorElement>) =>
        depart(event, event.currentTarget.href, "screen", "OPENING ACCOUNT"),
      logout,
      take: () => void takeDelivery(),
      cancelBridge,
      cardLeave: (event: MouseEvent<HTMLAnchorElement>) => leaveFromCard(event),
      cardRetry: () => {
        const bay = stateRef.current.card;
        if (bay !== null) void loadCard(bay);
      },
      cardSignIn: signInFromCard,
      copy: copyField,
      closeCard,
    },
  };
}
