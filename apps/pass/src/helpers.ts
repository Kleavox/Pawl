import { apiFetch } from "@pawl/core";
import { safeReturnTo } from "./return-to";

export const turnstileSiteKey =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ||
  (import.meta.env.DEV ? "1x00000000000000000000AA" : undefined);
export const returnTo =
  typeof window === "undefined"
    ? null
    : safeReturnTo(
        new URLSearchParams(window.location.search).get("returnTo"),
        window.location,
      );

export async function api<T = { ok: boolean }>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  return apiFetch<T>(path, {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function startOAuth(provider: "google" | "github") {
  const url = new URL(`/api/oauth/${provider}`, window.location.origin);
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  window.location.assign(url);
}

export function oauthErrorMessage(
  code: string | null,
): { text: string; kind: "error" | "info" } | null {
  if (!code) return null;
  if (code === "link_confirmation_sent") {
    return {
      text: "This email already has an account. Check your inbox to confirm linking the provider, then sign in again.",
      kind: "info",
    };
  }
  const messages: Record<string, string> = {
    provider_not_configured: "This provider is not configured yet.",
    oauth_cancelled: "Sign in was cancelled.",
    oauth_state_expired: "The sign-in request expired. Try again.",
    oauth_failed: "The provider could not complete sign in.",
    account_disabled: "This account is disabled.",
  };
  return { text: messages[code] ?? "OAuth sign in failed.", kind: "error" };
}

export function redirectToFreshChallenge() {
  const url = new URL("/challenge", window.location.origin);
  url.searchParams.set("scope", "fresh");
  url.searchParams.set("returnTo", window.location.href);
  window.location.assign(url);
}

export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Firefox/")
      ? "Firefox"
      : userAgent.includes("Chrome/")
        ? "Chrome"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Browser";
  const os = userAgent.includes("Windows")
    ? "Windows"
    : userAgent.includes("Mac OS")
      ? "macOS"
      : userAgent.includes("Android")
        ? "Android"
        : userAgent.includes("iPhone") || userAgent.includes("iPad")
          ? "iOS"
          : userAgent.includes("Linux")
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}
