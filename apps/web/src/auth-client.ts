import { apiFetch, ApiError, type Identity } from "@pawl/core";

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
  await apiFetch<{ ok: true }>("/api/auth/otp/start", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyOtpCode(
  email: string,
  code: string,
): Promise<VerifiedOtp> {
  try {
    return await apiFetch<VerifiedOtp>("/api/auth/otp/verify", {
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
