import { apiFetch, ApiError, type Identity } from "@pawl/core";
import { PASS_ORIGIN } from "@pawl/ui";

export interface VerifiedOtp {
  authenticated: true;
  user: Identity;
  needsSetup: boolean;
}

export class OtpVerifyError extends ApiError {
  readonly attemptsLeft?: number;

  constructor(source: ApiError, attemptsLeft: number | undefined) {
    super(source.message, source.status, source.code, source.details);
    this.attemptsLeft = attemptsLeft;
  }
}

function readAttemptsLeft(
  details: Record<string, unknown> | undefined,
): number | undefined {
  const value = details?.attemptsLeft;
  if (typeof value !== "number") return undefined;
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

export async function startOtp(email: string): Promise<void> {
  await apiFetch<{ ok: true }>(`${PASS_ORIGIN}/api/auth/otp/start`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyOtpCode(
  email: string,
  code: string,
): Promise<VerifiedOtp> {
  try {
    return await apiFetch<VerifiedOtp>(`${PASS_ORIGIN}/api/auth/otp/verify`, {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new OtpVerifyError(error, readAttemptsLeft(error.details));
    }
    throw error;
  }
}

export function silentSignInPath(place: {
  pathname: string;
  search: string;
}): string {
  const query = new URLSearchParams({
    returnTo: `${place.pathname}${place.search}`,
    prompt: "none",
  });
  return `/auth/signin?${query}`;
}

export async function signOut(): Promise<void> {
  const response = await fetch("/auth/signout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`The pass office answered ${response.status}.`);
  }
  const answer = (await response.json()) as {
    action: string | null;
    fields: Record<string, string>;
  };
  if (!answer.action) {
    window.location.assign("/");
    return;
  }
  const form = document.createElement("form");
  form.method = "post";
  form.action = answer.action;
  for (const [name, value] of Object.entries(answer.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}
