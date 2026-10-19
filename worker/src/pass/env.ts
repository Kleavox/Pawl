import type { DeployEnvironment } from "@pawl/core";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSIONS: KVNamespace;
  GATEWAY?: Fetcher;
  ENVIRONMENT: DeployEnvironment;
  PUBLIC_ORIGIN: string;
  ROOT_DOMAIN: string;
  FROM_EMAIL: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  IP_HASH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  OIDC_SIGNING_KEY?: string;
  OIDC_PREVIOUS_SIGNING_KEY?: string;
  OIDC_SUB_SECRET?: string;
  AUTHORIZE_RATE_LIMIT?: RateLimit;
  TOKEN_RATE_LIMIT?: RateLimit;
  SIGNIN_RATE_LIMIT?: RateLimit;
  SIGNIN_TRY_LIMIT?: RateLimit;
  SIGNIN_FAILURE_LIMIT?: RateLimit;
  ESTATE_MANIFEST?: string;
  [binding: string]: unknown;
}
