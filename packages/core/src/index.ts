export { ApiError, apiFetch, readApiResponse } from "./api.js";
export { renderErrorPage, errorCodeCopy } from "./error-page.js";
export type { ErrorPageOptions } from "./error-page.js";
export { escapeHtml } from "./escape.js";
export { MACHINE_PAGE_CSS, renderMachinePage } from "./machine-page.js";
export {
  CAMERA_HINT_HASH,
  CAMERA_HINT_SCRIPT,
  MACHINE_PARTS,
  renderMachine,
} from "./machine.js";
export type {
  MachineFraming,
  MachineKey,
  MachineKeypad,
  MachineOptions,
} from "./machine.js";
export type { MachinePageOptions } from "./machine-page.js";
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
