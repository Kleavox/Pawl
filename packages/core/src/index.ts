export { ApiError, apiFetch, readApiResponse } from "./api.js";
export { escapeHtml } from "./escape.js";
export { errorMessage } from "./errors.js";

export type DeployEnvironment = "development" | "preview" | "production";

export function displayHandle(
  username?: string | null,
  email?: string | null,
): string {
  if (username) return username;
  const local = email?.split("@")[0];
  return local || "Account";
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
