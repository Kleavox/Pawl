import { escapeHtml } from "./escape.js";
import { renderMachinePage } from "./machine-page.js";

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

export function errorCodeCopy(code?: string): {
  title: string;
  message: string;
} {
  return (code && ERROR_CODE_COPY[code]) || GENERIC_COPY;
}

export function renderErrorPage(options: ErrorPageOptions): string {
  const fallback = errorCodeCopy(options.code);
  const service = options.service ?? "Pawl";
  const title = options.title ?? fallback.title;
  const message = options.message ?? fallback.message;
  const given = options.homeHref ?? "/";
  const home =
    given.startsWith("/") && !given.startsWith("//")
      ? `${given.split("#")[0]}#cam=screen`
      : given;
  const code = options.code;
  const broken = code !== undefined && Number(code) >= 500;
  const status =
    code === "404"
      ? "NOTHING IN THIS BAY"
      : broken
        ? "OUT OF ORDER"
        : code
          ? `FAULT ${code}`
          : "FAULT";
  const led = code
    ? `<div class="page-led" data-code="${escapeHtml(code)}">${escapeHtml(code)}</div>`
    : "";
  return renderMachinePage({
    title: `${title} · ${service}`,
    status,
    where:
      code === "404"
        ? "EMPTY BAY"
        : broken
          ? "OUT OF ORDER"
          : code
            ? `FAULT ${code}`
            : "FAULT",
    sub: code ? `CODE ${code}` : undefined,
    body: `<p class="eyebrow eyebrow--danger">${escapeHtml(service)}</p>${led}<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><div class="actions"><a class="button button--primary" href="${escapeHtml(home)}">${escapeHtml(options.homeLabel ?? "Back to the machine")}</a></div>`,
    keys: { go: { kind: "link", href: home } },
    caption: "GO · TO THE MACHINE",
    sign: broken ? "OUT OF ORDER" : undefined,
    siteName: service,
  });
}
