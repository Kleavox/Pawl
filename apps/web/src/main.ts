import type { Identity } from "@pawl/core";
import "@pawl/ui/styles.css";
import "./styles/room.css";
import "./styles/machine.css";
import "./styles/panel.css";
import "./styles/base.css";
import { PASS_ORIGIN, type Overview } from "@pawl/ui";
import {
  OtpVerifyError,
  signOut,
  silentSignInPath,
  startOtp,
  verifyOtpCode,
} from "./auth-client";
import { toMachineModel, type MachineModel } from "./estate-adapter";
import { followView, mountTerminal } from "./machine/console";
import { createKeypad } from "./machine/keypad";
import {
  render,
  say as sayOn,
  viewFor,
  type ScreenView,
} from "./machine/render";
import { SITE } from "./site";
import { mountSound } from "./sound";
import {
  forgetRequest,
  readRememberedRequest,
  rememberRequest,
  runDispense,
  runReaderScan,
  runRelease,
  runScreenTransfer,
} from "./machine/sequence";
import {
  initialState,
  reduce,
  type BayCode,
  type MachineEvent,
  type MachineHost,
  type MachineState,
} from "./machine/state";

type GatewaySession = {
  authenticated: boolean;
  identity?: Identity;
  reason?: string;
};

const CATALOG = SITE.bays;
const SITE_NAME = SITE.site.name;
const TOOL_KEYS = SITE.tools.map((tool) => tool.key);
const BAY_CODES: readonly BayCode[] = CATALOG.map((bay) => bay.code);
const PRESSABLE = new Set([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "GO",
  "CLR",
]);
const TYPING = "input, textarea, select, button, a, [contenteditable]";
const FAULT_HOLD_MS = 2000;
const OTP_LENGTH = 6;
const NARROW = "(max-width: 899px)";
const TICKER_SPEED = 40;

function modelFor(
  session: GatewaySession,
  overview: Overview | null,
): MachineModel {
  return toMachineModel(session, overview, CATALOG, TOOL_KEYS, SITE_NAME);
}

let model: MachineModel = modelFor({ authenticated: false }, null);
let state: MachineState = initialState("guest", CATALOG);
let shownView: ScreenView | null = null;
let shownTicker = "";
let otpEmail = "";
let checking = false;
let bridging: AbortController | null = null;
let faultWords: string | null = null;
let retrying = false;

const keypad = createKeypad(BAY_CODES);
const sound = mountSound(document);

const bridge = document.querySelector<HTMLDialogElement>("[data-transfer]");
const trayAction = document.querySelector<HTMLElement>("[data-tray-action]");
const emailField = document.querySelector<HTMLInputElement>(
  "[data-terminal-email]",
);
const terminalForm = document.querySelector<HTMLFormElement>(
  "[data-terminal-form]",
);
const screenZone = document.querySelector<HTMLElement>("[data-screen-zone]");

function narrow(): boolean {
  try {
    return globalThis.matchMedia(NARROW).matches;
  } catch {
    return false;
  }
}

function bringScreenIntoView(): void {
  if (!narrow() || screenZone === null) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  screenZone.scrollIntoView({
    block: "center",
    behavior: still ? "auto" : "smooth",
  });
}

function armTicker(): void {
  const text = document.querySelector<HTMLElement>("[data-ticker-text]");
  const frame = text?.parentElement;
  if (!text || !frame || text.textContent === shownTicker) return;
  shownTicker = text.textContent ?? "";
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
}

function paint(): void {
  render(
    document,
    state,
    faultWords === null ? model : { ...model, screen: faultWords },
    faultWords !== null,
  );
  const view = viewFor(state);
  followView(document, shownView, view);
  if (shownView !== null && view !== shownView) {
    if (view === "signin" || view === "code") bringScreenIntoView();
  }
  shownView = view;
  armTicker();
}

function dispatch(event: MachineEvent): MachineState {
  faultWords = null;
  state = reduce(state, event);
  paint();
  return state;
}

const host: MachineHost = { read: () => state, dispatch };

function fault(words: string): void {
  state = reduce(state, { type: "reset" });
  faultWords = words;
  paint();
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "The machine could not complete that.";
}

function screenWords(message: string): string {
  return message.replace(/[.]+$/u, "").toUpperCase();
}

function hold(ms: number): Promise<void> {
  return new Promise((settled) => setTimeout(settled, ms));
}

function isBay(value: string | undefined): value is BayCode {
  return (BAY_CODES as readonly string[]).includes(value ?? "");
}

function hrefFor(bay: BayCode): string {
  const cartridge = document.querySelector<HTMLElement>(
    `[data-cartridge="${bay}"]`,
  );
  return cartridge?.dataset.href ?? "/";
}

function say(message: string): void {
  sayOn(document, state, message);
}

function masked(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return domain === "" ? email : `${local.slice(0, 1)}•••@${domain}`;
}

async function readSession(): Promise<GatewaySession> {
  const response = await fetch("/api/session", { credentials: "include" });
  if (!response.ok) {
    throw new Error(`The pass office answered ${response.status}.`);
  }
  return (await response.json()) as GatewaySession;
}

async function readEstate(): Promise<Overview | null> {
  try {
    const response = await fetch("/api/estate", { credentials: "include" });
    if (!response.ok) return null;
    return (await response.json()) as Overview;
  } catch {
    return null;
  }
}

function estateUnread(): boolean {
  return (faultWords ?? model.screen).includes("UNREADABLE");
}

async function retryEstate(): Promise<void> {
  if (retrying) return;
  retrying = true;
  try {
    let session: GatewaySession;
    try {
      session = await readSession();
    } catch {
      fault("SESSION STILL UNREADABLE");
      return;
    }
    if (!session.authenticated && session.reason === "expired") {
      if (!keepRequest()) await hold(FAULT_HOLD_MS);
      window.location.assign(silentSignInPath(window.location));
      return;
    }
    const overview = session.authenticated ? await readEstate() : null;
    model = modelFor(session, overview);
    if (model.access === "guest") {
      forgetRequest();
      dispatch({ type: "pass-removed" });
      return;
    }
    dispatch({ type: "pass-issued", access: model.access });
    if (model.screen.includes("UNREADABLE")) {
      fault("ESTATE STILL UNREADABLE");
      return;
    }
    dispatch({ type: "reset" });
    await resumeRemembered();
  } finally {
    retrying = false;
  }
}

async function dispense(bay: BayCode): Promise<void> {
  try {
    await runDispense(host, bay);
  } catch {
    fault("RELEASE FAILED, TRY AGAIN");
  }
}

async function resumeRemembered(): Promise<void> {
  const bay = readRememberedRequest(BAY_CODES);
  if (bay === null) return;
  forgetRequest();
  await dispense(bay);
}

async function release(): Promise<void> {
  try {
    await runRelease(host);
  } catch {
    fault("RELEASE FAILED, TRY AGAIN");
  }
}

async function takeDelivery(): Promise<void> {
  if (bridging !== null) return;
  const controller = new AbortController();
  bridging = controller;
  try {
    await runScreenTransfer(
      dispatch,
      (bay) => window.location.assign(hrefFor(bay)),
      controller.signal,
    );
  } catch {
    fault("BRIDGE FAILED, RELEASE IT AGAIN");
  } finally {
    if (bridging === controller) bridging = null;
  }
  if (state.screenTransfer === null) {
    trayAction?.focus({ preventScroll: true });
  }
}

function cancelBridge(): void {
  if (bridging !== null) {
    bridging.abort();
    return;
  }
  dispatch({ type: "cancel" });
  trayAction?.focus({ preventScroll: true });
}

function openMethods(): void {
  if (state.access !== "guest") return;
  if (state.authStep !== "closed" || state.status === "reading") return;
  const reading = dispatch({ type: "pass-tap" });
  if (reading.status !== "reading") return;
  dispatch({ type: "reader-scanned" });
}

async function tapPass(): Promise<void> {
  try {
    await runReaderScan(dispatch);
  } catch {
    fault("PASS READER FAULT");
  }
}

async function adoptPass(identity: Identity): Promise<void> {
  const session: GatewaySession = { authenticated: true, identity };
  const overview = await readEstate();
  model = modelFor(session, overview);
  const issued = dispatch({ type: "pass-issued", access: model.access });
  if (issued.status === "dispensing" && issued.selection !== null) {
    await release();
    return;
  }
  dispatch({ type: "reset" });
}

async function sendCode(): Promise<void> {
  const email = emailField?.value.trim() ?? "";
  if (email === "") {
    say("Enter the email address your code should go to.");
    return;
  }
  say("");
  openMethods();
  try {
    await startOtp(email);
  } catch (error) {
    say(messageOf(error));
    return;
  }
  otpEmail = email;
  keypad.reset();
  for (const target of document.querySelectorAll("[data-code-email]")) {
    target.textContent = masked(email);
  }
  const next = dispatch({ type: "otp-sent" });
  if (next.authStep !== "otp-machine") {
    say("Tap your pass on the machine, then send the code.");
    return;
  }
  keypad.setMode("otp");
}

async function reconcileVerify(): Promise<void> {
  let session: GatewaySession | null = null;
  try {
    session = await readSession();
  } catch {
    session = null;
  }
  if (session?.authenticated !== true || !session.identity) {
    say(
      "The machine could not tell whether your code went through. Press GO " +
        "to send the same code again, and ask for a new code if it is refused.",
    );
    return;
  }
  keypad.reset();
  keypad.setMode("selector");
  dispatch({ type: "verifying" });
  if (session.identity.username === null) {
    if (!keepRequest()) await hold(FAULT_HOLD_MS);
    leaveFor(new URL("/welcome", PASS_ORIGIN));
    return;
  }
  await adoptPass(session.identity);
}

async function submitCode(code: string): Promise<void> {
  if (checking) return;
  checking = true;
  say("");
  let verified;
  try {
    verified = await verifyOtpCode(otpEmail, code);
  } catch (error) {
    if (!(error instanceof OtpVerifyError)) {
      await reconcileVerify();
      return;
    }
    const attemptsLeft = error.attemptsLeft;
    if (attemptsLeft === undefined) {
      keypad.reset();
      keypad.setMode("selector");
      fault(screenWords(messageOf(error)));
      return;
    }
    dispatch({ type: "otp-rejected", attemptsLeft });
    keypad.reset();
    return;
  } finally {
    checking = false;
  }

  keypad.reset();
  keypad.setMode("selector");
  dispatch({ type: "verifying" });

  if (verified.needsSetup) {
    if (!keepRequest()) await hold(FAULT_HOLD_MS);
    leaveFor(new URL("/welcome", PASS_ORIGIN));
    return;
  }

  let session: GatewaySession | null = null;
  try {
    session = await readSession();
  } catch {
    session = null;
  }
  if (session?.authenticated && session.identity) {
    try {
      await adoptPass(session.identity);
    } catch {
      fault("PASS ACCEPTED, MACHINE DID NOT WAKE");
    }
    return;
  }
  if (!keepRequest()) await hold(FAULT_HOLD_MS);
  window.location.assign(silentSignInPath(window.location));
}

function keepRequest(): boolean {
  const wanted = state.authRequest;
  if (wanted === null || rememberRequest(wanted)) return true;
  say(
    "This browser will not hold your bay request, so the machine cannot " +
      "open it for you when you come back. Sign in, then pick the bay again.",
  );
  return false;
}

function leaveFor(url: URL): void {
  url.searchParams.set(
    "returnTo",
    new URL(silentSignInPath(window.location), window.location.origin).href,
  );
  window.location.assign(url.toString());
}

async function startProvider(provider: string): Promise<void> {
  if (keepRequest()) {
    dispatch({ type: "oauth-started" });
  } else {
    await hold(FAULT_HOLD_MS);
  }
  leaveFor(new URL(`/api/oauth/${provider}`, PASS_ORIGIN));
}

function press(key: string): void {
  const cap = document.querySelector<HTMLElement>(`[data-key="${key}"]`);
  if (cap === null) return;
  cap.classList.add("is-pressed");
  setTimeout(() => cap.classList.remove("is-pressed"), 120);
}

function unlit(key: string): boolean {
  return (
    document
      .querySelector(`[data-key="${key}"]`)
      ?.getAttribute("aria-disabled") === "true"
  );
}

async function pressKey(key: string): Promise<void> {
  if (unlit(key)) return;
  sound.click();
  if (state.authStep === "methods") {
    if (key === "GO") terminalForm?.requestSubmit();
    if (key === "CLR") dispatch({ type: "cancel" });
    return;
  }
  const otp = state.authStep === "otp-machine";
  keypad.setMode(otp ? "otp" : "selector");
  const result = keypad.press(key);
  if (otp) dispatch({ type: "otp-digits", digits: keypad.digits() });

  if (otp && key === "GO" && keypad.digits().length === OTP_LENGTH) {
    await submitCode(keypad.digits());
    return;
  }
  if (!otp && key === "GO" && result.kind === "ignored" && estateUnread()) {
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
  if (result.kind === "code-complete") {
    await submitCode(result.code);
    return;
  }
  if (result.kind === "cancelled" || (!otp && key === "CLR")) {
    dispatch({ type: otp ? "otp-back" : "cancel" });
  }
}

mountTerminal(document, host);

for (const cartridge of document.querySelectorAll<HTMLButtonElement>(
  "[data-cartridge]",
)) {
  const bay = cartridge.dataset.cartridge;
  if (!isBay(bay)) continue;
  cartridge.addEventListener("click", () => void dispense(bay));
}

for (const key of document.querySelectorAll<HTMLButtonElement>("[data-key]")) {
  const label = key.dataset.key;
  if (label === undefined) continue;
  key.addEventListener("click", () => void pressKey(label));
}

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof Element && event.target.closest(TYPING)) return;
  const pressed =
    event.key === "Enter"
      ? "GO"
      : event.key === "Backspace"
        ? "CLR"
        : event.key;
  if (!PRESSABLE.has(pressed)) return;
  event.preventDefault();
  if (unlit(pressed)) return;
  press(pressed);
  void pressKey(pressed);
});

document
  .querySelector<HTMLButtonElement>("[data-reader]")
  ?.addEventListener("click", () => void tapPass());

document
  .querySelector<HTMLButtonElement>("[data-logout]")
  ?.addEventListener("click", () => {
    signOut().catch(() => fault("SIGN-OUT FAILED, TRY AGAIN"));
  });

trayAction?.addEventListener("click", () => void takeDelivery());

document
  .querySelector<HTMLButtonElement>("[data-transfer-cancel]")
  ?.addEventListener("click", cancelBridge);

bridge?.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelBridge();
});

for (const opener of document.querySelectorAll<HTMLButtonElement>(
  "[data-terminal-open]",
)) {
  opener.addEventListener("click", openMethods);
}

terminalForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendCode();
});

for (const provider of document.querySelectorAll<HTMLButtonElement>(
  "[data-terminal-provider]",
)) {
  const which = provider.dataset.terminalProvider;
  if (which === undefined) continue;
  provider.addEventListener("click", () => void startProvider(which));
}

async function boot(): Promise<void> {
  let session: GatewaySession = { authenticated: false };
  let unread = false;
  try {
    session = await readSession();
  } catch {
    unread = true;
  }

  const overview = session.authenticated ? await readEstate() : null;
  model = modelFor(session, overview);
  if (unread) {
    model = {
      ...model,
      screen: "SESSION UNREADABLE",
      ticker: "SESSION UNREADABLE · PRESS GO TO RETRY",
    };
  }

  if (model.access === "guest") {
    if (!unread) forgetRequest();
    paint();
    return;
  }

  dispatch({ type: "pass-issued", access: model.access });
  dispatch({ type: "reset" });
  await resumeRemembered();
}

boot().catch(() => fault("MACHINE DID NOT START"));
