import { describe, expect, it, vi } from "vitest";
import { startOtp, verifyOtpCode, OtpVerifyError } from "./auth-client";

describe("startOtp", () => {
  it("calls its own origin, never the pass host", async () => {
    const fetchMock = vi.fn(
      async (..._args: unknown[]) =>
        new Response('{"ok":true}', { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await startOtp("a@example.com");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/auth/otp/start");
  });

  it("surfaces a rate limit as a message the screen can show", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          '{"message":"Too many attempts. Try again in 60 seconds."}',
          { status: 429 },
        ),
    );
    await expect(startOtp("a@example.com")).rejects.toThrow(/60 seconds/);
  });
});

describe("verifyOtpCode", () => {
  it("calls its own origin, never the pass host", async () => {
    const fetchMock = vi.fn(
      async (..._args: unknown[]) =>
        new Response('{"authenticated":true,"needsSetup":false}', {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await verifyOtpCode("a@example.com", "246810");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/auth/otp/verify");
  });

  it("reports that setup is still needed for a fresh account", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response('{"authenticated":true,"needsSetup":true}', {
          status: 200,
        }),
    );
    await expect(
      verifyOtpCode("a@example.com", "246810"),
    ).resolves.toMatchObject({
      needsSetup: true,
    });
  });

  it("surfaces a rejected code instead of resolving quietly", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response('{"message":"That code is not valid."}', { status: 401 }),
    );
    await expect(verifyOtpCode("a@example.com", "000000")).rejects.toThrow();
  });

  it("surfaces the server's remaining-attempt count on a wrong code, without inventing one", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            code: "invalid_code",
            message: "That code is incorrect.",
            attemptsLeft: 3,
          }),
          { status: 401 },
        ),
    );
    const rejection = await verifyOtpCode("a@example.com", "000000").catch(
      (error: unknown) => error,
    );
    expect(rejection).toBeInstanceOf(OtpVerifyError);
    expect((rejection as OtpVerifyError).attemptsLeft).toBe(3);
  });

  it("carries no attempt count when the server did not send one", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            code: "code_expired",
            message: "That code has expired. Request a new one.",
          }),
          { status: 401 },
        ),
    );
    const rejection = await verifyOtpCode("a@example.com", "000000").catch(
      (error: unknown) => error,
    );
    expect(rejection).toBeInstanceOf(OtpVerifyError);
    expect((rejection as OtpVerifyError).attemptsLeft).toBeUndefined();
  });

  it("does not trust an attempt count the server sent in the wrong shape", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            code: "invalid_code",
            message: "That code is incorrect.",
            attemptsLeft: "3",
          }),
          { status: 401 },
        ),
    );
    const rejection = await verifyOtpCode("a@example.com", "000000").catch(
      (error: unknown) => error,
    );
    expect(rejection).toBeInstanceOf(OtpVerifyError);
    expect((rejection as OtpVerifyError).attemptsLeft).toBeUndefined();
  });

  it.each([
    ["null", "null"],
    ["a fraction", "2.5"],
    ["a negative count", "-1"],
  ])(
    "refuses to put %s on the machine screen as an attempt count",
    async (_label, attemptsLeft) => {
      vi.stubGlobal(
        "fetch",
        async () =>
          new Response(
            `{"code":"invalid_code","message":"That code is incorrect.","attemptsLeft":${attemptsLeft}}`,
            { status: 401 },
          ),
      );
      const rejection = await verifyOtpCode("a@example.com", "000000").catch(
        (error: unknown) => error,
      );
      expect(rejection).toBeInstanceOf(OtpVerifyError);
      expect((rejection as OtpVerifyError).attemptsLeft).toBeUndefined();
    },
  );

  it("still trusts a real remaining count of zero", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            code: "invalid_code",
            message: "That code is incorrect.",
            attemptsLeft: 0,
          }),
          { status: 401 },
        ),
    );
    const rejection = await verifyOtpCode("a@example.com", "000000").catch(
      (error: unknown) => error,
    );
    expect((rejection as OtpVerifyError).attemptsLeft).toBe(0);
  });
});
