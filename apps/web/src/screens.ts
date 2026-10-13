import { escapeHtml } from "@pawl/core";

export type ScreensInput = {
  siteName: string;
  passHref: string;
  passSignIn: string;
  passHost: string;
  tiles: string;
};

function bar(where: string, right: string): string {
  return `<div class="view__bar"><span class="view__where">${where}</span>${right}</div>`;
}

function foot(hint: string, say = ""): string {
  return `<div class="view__foot"><p class="view__hint" aria-hidden="true">${hint}</p>${say}</div>`;
}

function say(extra = ""): string {
  return `<p class="view__say" role="alert"${extra} data-say></p>`;
}

function back(label: string, hook: string): string {
  return `<button class="view__back" type="button" ${hook} data-step-back>‹ ${label}</button>`;
}

const KEY = (label: string, go = false): string =>
  `<kbd${go ? ' class="is-go"' : ""}>${label}</kbd>`;

function products(tiles: string): string {
  return `<section class="view view--products" data-view-panel="products" aria-label="Products" tabindex="-1">${bar(
    `<span data-greeting>PICK A BAY</span>`,
    `<button class="view__bar-action" type="button" data-terminal-open>SIGN IN ▸</button><button class="view__bar-action" type="button" data-account-open hidden>ACCOUNT ▸</button>`,
  )}<div class="view__body view__body--tiles">${tiles}${say()}</div>${foot(
    `<span class="view__hint-rest">${KEY("1")}–${KEY("9")} pick · ${KEY("GO", true)} take<span class="view__hint-more"> · ${KEY("CLR")} put back</span></span><span class="view__hint-releasing">Releasing… take it from the bay below</span>`,
  )}</section>`;
}

function signin(input: ScreensInput): string {
  const choice = (
    key: string,
    mark: string,
    label: string,
    hook: string,
    focus = "",
  ): string =>
    `<li><button class="choice" type="button" ${hook} aria-keyshortcuts="${key}"${focus}><kbd class="choice__key" aria-hidden="true">${key}</kbd><span class="choice__mark" aria-hidden="true">${mark}</span><span class="choice__label">${label}</span></button></li>`;
  return `<section class="view view--form" data-view-panel="signin" data-terminal aria-labelledby="terminal-title" hidden>${bar(
    `<span class="view__where-default">SIGN IN</span><span class="view__for" data-sign-in-for></span>`,
    `<span class="view__step">STEP 1 OF 3</span>`,
  )}<div class="view__body"><h2 class="view__title" id="terminal-title">Sign in to ${escapeHtml(input.siteName)}</h2><ol class="choices">${choice(
    "1",
    "G",
    "Continue with Google",
    'data-terminal-provider="google"',
    " data-autofocus",
  )}${choice("2", "GH", "Continue with GitHub", 'data-terminal-provider="github"')}${choice(
    "3",
    "@",
    "Email me a code",
    "data-terminal-email-choice",
  )}</ol><p class="view__note view__note--line view__aside">Password? <a href="${escapeHtml(input.passSignIn)}">Sign in on ${escapeHtml(input.passHost)}</a></p>${say(" data-terminal-error")}${back(
    "Back to the bays",
    "data-terminal-close",
  )}</div>${foot(`${KEY("1")}–${KEY("3")} choose · ${KEY("CLR")} back`)}</section>`;
}

function email(): string {
  return `<section class="view view--form" data-view-panel="email" aria-labelledby="email-title" hidden>${bar(
    "EMAIL CODE",
    `<span class="view__step">STEP 2 OF 3</span>`,
  )}<div class="view__body"><h2 class="view__title" id="email-title">Where should the code go?</h2><form class="view__email" data-terminal-form novalidate><label class="view__label" for="terminal-email">Email address</label><span class="view__field"><input class="view__input" id="terminal-email" type="email" autocomplete="email" placeholder="name@example.com" data-terminal-email data-autofocus /><button class="view__button view__button--go" type="submit" data-terminal-send>Send the code</button></span></form><p class="view__note view__aside">Six digits arrive by email; type them on the keypad.</p>${say(" data-email-error")}${back(
    "Back",
    "data-email-close",
  )}</div>${foot(`${KEY("GO", true)} send · ${KEY("CLR")} back`)}</section>`;
}

function code(): string {
  const cells = Array.from(
    { length: 6 },
    () => `<span class="code-cell" data-code-cell></span>`,
  ).join("");
  return `<section class="view view--form" data-view-panel="code" aria-labelledby="view-code-title" tabindex="-1" data-autofocus hidden>${bar(
    "EMAIL CODE",
    `<span class="view__step">STEP 3 OF 3</span>`,
  )}<div class="view__body"><p class="view__eyebrow">Code sent</p><h2 class="view__title" id="view-code-title">Type the 6 digits on the keypad</h2><p class="view__note view__aside">Sent to <strong data-code-email></strong>. The code lasts 10 minutes.</p><div class="code-cells" aria-hidden="true">${cells}</div><p class="view__note view__tries view__aside" data-code-tries></p>${say(" data-code-error")}${back(
    "Use another email",
    "data-code-close",
  )}</div>${foot(`${KEY("0")}–${KEY("9")} type · ${KEY("CLR")} undo · ${KEY("GO", true)} check`)}</section>`;
}

function working(): string {
  return `<section class="view view--form" data-view-panel="working" aria-labelledby="view-working-title" tabindex="-1" hidden>${bar(
    "ONE MOMENT",
    "",
  )}<div class="view__body view__body--center"><p class="view__eyebrow">One moment</p><h2 class="view__title" id="view-working-title">Checking your pass</h2><span class="view__loader" aria-hidden="true"><i></i><i></i><i></i></span>${say()}</div>${foot(
    "Hold on, the machine is busy",
  )}</section>`;
}

function account(input: ScreensInput): string {
  return `<section class="view view--form" data-view-panel="account" aria-labelledby="view-account-title" tabindex="-1" hidden>${bar(
    "YOUR ACCOUNT",
    `<span class="view__step" data-account-pass></span>`,
  )}<div class="view__body"><p class="view__eyebrow is-ok">Signed in</p><h2 class="view__title" id="view-account-title" data-account-name></h2><p class="view__note view__email" data-account-email></p><p class="view__note" data-account-role></p><div class="view__actions"><a class="view__button" href="${escapeHtml(input.passHref)}" data-account-manage>Manage account ↗</a><button class="view__button view__button--danger" type="button" data-logout>Sign out</button></div>${say()}${back(
    "Back to the bays",
    "data-account-close",
  )}</div>${foot(`${KEY("CLR")} back`)}</section>`;
}

export function renderScreens(input: ScreensInput): string {
  return `<div class="screen" data-screen-views>${products(input.tiles)}${signin(input)}${email()}${code()}${working()}${account(input)}</div>`;
}
