export { ApiError, apiFetch, readApiResponse } from "./api";
export { renderErrorPage, errorCodeCopy, escapeHtml } from "./error-page";
export type { ErrorPageOptions } from "./error-page";
export { errorMessage } from "./errors";

export type DeployEnvironment = "development" | "preview" | "production";

export const PRODUCT_NAMES = ["web", "pass", "link", "portfolio"] as const;

export type ProductName = (typeof PRODUCT_NAMES)[number];

export const FILE_SLUG_PREFIX = "f_";

export const RESERVED_SLUGS = [
  "about",
  "account",
  "api",
  "assets",
  "contact",
  "des",
  "drop",
  "favicon.ico",
  "kry",
  "link",
  "link-assets",
  "login",
  "pass",
  "paw",
  "pawl",
  "port",
  "portfolio",
  "privacy",
  "projects",
  "pulse",
  "robots.txt",
  "sitemap.xml",
  "terms",
  "thy",
] as const;

const reservedSlugSet = new Set<string>(RESERVED_SLUGS);

export function displayHandle(
  username?: string | null,
  email?: string | null,
): string {
  if (username) return username;
  const local = email?.split("@")[0];
  return local || "Account";
}

export function isReservedSlug(value: string): boolean {
  return reservedSlugSet.has(value.trim().toLowerCase());
}

export function isFileSlug(value: string): boolean {
  const slug = value.trim().toLowerCase();
  return (
    slug.startsWith(FILE_SLUG_PREFIX) &&
    /^[a-z0-9][a-z0-9_-]{7,63}$/u.test(slug)
  );
}

export interface Identity {
  id: string;
  email: string;
  username: string | null;
  role: "ADMIN" | "USER";
}

export interface SessionIdentity {
  identity: Identity;
  sessionId: string;
  expiresAt: string;
}
