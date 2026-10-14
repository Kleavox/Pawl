import type { Identity } from "@pawl/core";
export type { DeviceSession } from "@pawl/protocol";

export type Mode = "login" | "register" | "forgot";

export interface SessionResponse {
  authenticated: boolean;
  user?: Identity;
  expiresAt?: string;
}

export interface OAuthProviders {
  google: boolean;
  github: boolean;
}

export interface ConnectedApp {
  clientId: string;
  name: string;
  homepage: string | null;
  sector: string;
  scopes: string[];
  createdAt: string;
}
