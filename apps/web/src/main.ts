import { displayHandle, type Identity } from "@pawl/core";
import "@pawl/ui/styles.css";
import "./styles/global.css";
import "./styles/machine.css";
import {
  navCountsFrom,
  renderAppHeader,
  PASS_ORIGIN,
  UNREADABLE_COUNTS,
  type NavCounts,
  type Overview,
} from "@pawl/ui";
import { OtpVerifyError, startOtp, verifyOtpCode } from "./auth-client";
import { toMachineModel, type MachineModel } from "./estate-adapter";
import { mountConsole, mountTerminal } from "./machine/console";
import { createKeypad } from "./machine/keypad";
import { render } from "./machine/render";
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

type GatewaySession = { authenticated: boolean; identity?: Identity };

const BAY_CODES: readonly BayCode[] = ["1", "3"];
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

let model: MachineModel = toMachineModel({ authenticated: false }, null);
let state: MachineState = initialState("guest");
let otpEmail = "";
let checking = false;
let bridging: AbortController | null = null;
let faultWords: string | null = null;
let retrying = false;

const keypad = createKeypad();

const terminal = document.querySelector<HTMLDialogElement>("[data-terminal]");
const bridge = document.querySelector<HTMLDialogElement>("[data-transfer]");
const trayAction = document.querySelector<HTMLElement>("[data-tray-action]");
const emailField = document.querySelector<HTMLInputElement>(
  "[data-terminal-email]",
);
const terminalError = document.querySelector<HTMLElement>(
  "[data-terminal-error]",
);

function paint(): void {
  render(
    document,
    state,
    faultWords === null ? model : { ...model, screen: faultWords },
  );
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

function showTerminalError(message: string): void {
  if (terminalError) terminalError.textContent = message;
}

const headerTarget = document.querySelector<HTMLElement>("[data-app-header]");
const headerAccountTemplate = document.querySelector<HTMLTemplateElement>(
  "[data-header-account]",
);
const accountNode =
  headerAccountTemplate?.content.firstElementChild instanceof HTMLElement
    ? (headerAccountTemplate.content.firstElementChild.cloneNode(
        true,
      ) as HTMLElement)
    : null;

function paintHeader(counts: NavCounts | null): void {
  if (!headerTarget) return;
  renderAppHeader(headerTarget, { counts });
  if (accountNode) headerTarget.append(accountNode);
}

function headerCounts(
  session: GatewaySession,
  overview: Overview | null,
): NavCounts | null {
  if (!session.authenticated) return null;
  return overview === null ? UNREADABLE_COUNTS : navCountsFrom(overview);
}

const account =
  accountNode?.matches("[data-account]") === true
    ? accountNode
    : (accountNode?.querySelector<HTMLElement>("[data-account]") ?? null);
const signIn = accountNode?.querySelector<HTMLElement>("[data-signin]") ?? null;
const menu =
  accountNode?.querySelector<HTMLElement>("[data-account-menu]") ?? null;
const trigger =
  accountNode?.querySelector<HTMLButtonElement>("[data-account-trigger]") ??
  null;
const dropdown =
  accountNode?.querySelector<HTMLElement>("[data-account-dropdown]") ?? null;
const name =
  accountNode?.querySelector<HTMLElement>("[data-account-name]") ?? null;
const logout =
  accountNode?.querySelector<HTMLButtonElement>("[data-logout]") ?? null;

const closeMenu = (): void => {
  dropdown?.setAttribute("hidden", "");
  trigger?.setAttribute("aria-expanded", "false");
};

trigger?.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = trigger.getAttribute("aria-expanded") === "true";
  if (open) {
    closeMenu();
    return;
  }
  dropdown?.removeAttribute("hidden");
  trigger.setAttribute("aria-expanded", "true");
});

dropdown?.addEventListener("click", (event) => event.stopPropagation());
window.addEventListener("click", closeMenu);

logout?.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
  } finally {
    window.location.reload();
  }
});

function paintAccount(session: GatewaySession): void {
  if (!session.authenticated || !session.identity) {
    signIn?.removeAttribute("hidden");
    menu?.setAttribute("hidden", "");
    account?.classList.remove("is-authenticated");
    return;
  }
  if (name) {
    name.textContent = displayHandle(
      session.identity.username,
      session.identity.email,
    );
  }
  signIn?.setAttribute("hidden", "");
  menu?.removeAttribute("hidden");
  account?.classList.add("is-authenticated");
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
    const overview = session.authenticated ? await readEstate() : null;
    model = toMachineModel(session, overview);
    paintHeader(headerCounts(session, overview));
    paintAccount(session);
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
  const bay = readRememberedRequest();
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
  const chosen = dispatch({ type: "reader-scanned" });
  if (chosen.authStep === "methods" && terminal && !terminal.open) {
    terminal.showModal();
  }
}

async function tapPass(): Promise<void> {
  try {
    await runReaderScan(dispatch);
  } catch {
    fault("PASS READER FAULT");
    return;
  }
  if (state.authStep === "methods" && terminal && !terminal.open) {
    terminal.showModal();
  }
}

async function adoptPass(identity: Identity): Promise<void> {
  const session: GatewaySession = { authenticated: true, identity };
  const overview = await readEstate();
  model = toMachineModel(session, overview);
  paintHeader(headerCounts(session, overview));
  paintAccount(session);
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
    showTerminalError("Enter the email address your code should go to.");
    return;
  }
  showTerminalError("");
  openMethods();
  try {
    await startOtp(email);
  } catch (error) {
    showTerminalError(messageOf(error));
    return;
  }
  otpEmail = email;
  const next = dispatch({ type: "otp-sent" });
  if (next.authStep !== "otp-machine") {
    showTerminalError("Tap your pass on the machine, then send the code.");
    return;
  }
  keypad.setMode("otp");
  terminal?.close();
}

async function reconcileVerify(): Promise<void> {
  let session: GatewaySession | null = null;
  try {
    session = await readSession();
  } catch {
    session = null;
  }
  if (session?.authenticated !== true || !session.identity) {
    showTerminalError(
      "The machine could not tell whether your code went through. Close " +
        "this and press GO to send the same code again, and ask for a new " +
        "code if it is refused.",
    );
    if (terminal && !terminal.open) terminal.showModal();
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

  try {
    await adoptPass(verified.user);
  } catch {
    fault("PASS ACCEPTED, MACHINE DID NOT WAKE");
  }
}

function keepRequest(): boolean {
  const wanted = state.authRequest;
  if (wanted === null || rememberRequest(wanted)) return true;
  showTerminalError(
    "This browser will not hold your bay request, so the machine cannot " +
      "open it for you when you come back. Sign in, then pick the bay again.",
  );
  if (terminal && !terminal.open) terminal.showModal();
  return false;
}

function leaveFor(url: URL): void {
  url.searchParams.set("returnTo", window.location.href);
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

async function pressKey(key: string): Promise<void> {
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
  if (result.kind === "cancelled") {
    dispatch({ type: "cancel" });
  }
}

paintHeader(null);
mountConsole(document, host);
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
  void pressKey(pressed);
});

document
  .querySelector<HTMLButtonElement>("[data-reader]")
  ?.addEventListener("click", () => void tapPass());

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

document
  .querySelector<HTMLButtonElement>("[data-terminal-send]")
  ?.addEventListener("click", () => void sendCode());

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
  model = toMachineModel(session, overview);
  if (unread) model = { ...model, screen: "SESSION UNREADABLE" };
  paintHeader(unread ? UNREADABLE_COUNTS : headerCounts(session, overview));
  paintAccount(session);

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
