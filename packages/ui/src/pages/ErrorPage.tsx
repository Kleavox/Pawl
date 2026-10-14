import {
  ACTIONS,
  BUTTON_PRIMARY,
  EYEBROW_DANGER,
  HEADING,
  renderMachinePage,
  TEXT,
} from "./MachinePage";

export interface ErrorPageOptions {
  code?: string;
  service?: string;
  title?: string;
  message?: string;
  homeHref?: string;
  homeLabel?: string;
}

const GENERIC_COPY = {
  title: "Something went wrong",
  message: "An unexpected error occurred.",
};

const ERROR_CODE_COPY: Record<string, { title: string; message: string }> = {
  "400": {
    title: "Bad request",
    message:
      "The request could not be understood. Check the address and retry.",
  },
  "401": {
    title: "Sign in required",
    message: "You need to sign in to access this page.",
  },
  "403": {
    title: "Access denied",
    message: "You don't have permission to view this page.",
  },
  "404": {
    title: "Page not found",
    message: "This page doesn't exist, or it has moved or expired.",
  },
  "410": {
    title: "Gone",
    message: "This resource is no longer available.",
  },
  "429": {
    title: "Too many requests",
    message: "Slow down and try again in a moment.",
  },
  "500": {
    title: "Something broke",
    message:
      "Something went wrong on our side. Give it a moment and try again.",
  },
  "503": {
    title: "Service unavailable",
    message: "This service is temporarily unavailable. Try again shortly.",
  },
};

const LED =
  "page-led text-pw-ice [font:800_--spacing(64)/1_var(--pw-mono)] tracking-[0.08em] [text-shadow:0_0_--spacing(18)_var(--pw-cobalt)] max-desk:[font-size:--spacing(48)]";

export function errorCodeCopy(code?: string): {
  title: string;
  message: string;
} {
  return (code && ERROR_CODE_COPY[code]) || GENERIC_COPY;
}

function homeOf(given: string): string {
  return given.startsWith("/") && !given.startsWith("//")
    ? `${given.split("#")[0]}#cam=screen`
    : given;
}

export function renderErrorPage(options: ErrorPageOptions): string {
  const fallback = errorCodeCopy(options.code);
  const service = options.service ?? "Pawl";
  const title = options.title ?? fallback.title;
  const message = options.message ?? fallback.message;
  const home = homeOf(options.homeHref ?? "/");
  const code = options.code;
  const broken = code !== undefined && Number(code) >= 500;
  const fault = code ? `FAULT ${code}` : "FAULT";
  return renderMachinePage({
    title: `${title} · ${service}`,
    status:
      code === "404" ? "NOTHING IN THIS BAY" : broken ? "OUT OF ORDER" : fault,
    where: code === "404" ? "EMPTY BAY" : broken ? "OUT OF ORDER" : fault,
    sub: code ? `CODE ${code}` : undefined,
    keys: { go: { kind: "link", href: home } },
    caption: "GO · TO THE MACHINE",
    sign: broken ? "OUT OF ORDER" : undefined,
    siteName: service,
    children: (
      <>
        <p className={EYEBROW_DANGER}>{service}</p>
        {code ? (
          <div className={LED} data-code={code}>
            {code}
          </div>
        ) : null}
        <h1 className={HEADING}>{title}</h1>
        <p className={TEXT}>{message}</p>
        <div className={ACTIONS}>
          <a className={BUTTON_PRIMARY} href={home} data-home="">
            {options.homeLabel ?? "Back to the machine"}
          </a>
        </div>
      </>
    ),
  });
}
