import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "./crypto";
import { fakeOtpDb } from "./otp-db.testkit";
import { issueOtp, verifyOtp } from "./otp";

import type { Env } from "../env";

function fakeEnv(): ReturnType<typeof fakeOtpDb> & { env: Env } {
  const made = fakeOtpDb();
  return { ...made, env: { DB: made.DB } as unknown as Env };
}

const MINUTE = 60_000;

afterEach(() => {
  vi.useRealTimers();
});

describe("otp", () => {
  it("issues a six digit code", async () => {
    const { env } = fakeEnv();
    expect(await issueOtp(env, "a@example.com")).toMatch(/^\d{6}$/);
  });

  it("accepts the code it issued", async () => {
    const { env } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");
    expect(await verifyOtp(env, "a@example.com", code)).toEqual({
      status: "ok",
    });
  });

  it("ignores case and padding in the email", async () => {
    const { env } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");
    expect(await verifyOtp(env, "  A@Example.com ", code)).toEqual({
      status: "ok",
    });
  });

  it("rejects a wrong code, consumes an attempt, and reports the four left", async () => {
    const { env } = fakeEnv();
    await issueOtp(env, "a@example.com");
    expect(await verifyOtp(env, "a@example.com", "000000")).toEqual({
      status: "wrong",
      attemptsLeft: 4,
    });
  });

  it("stops after five wrong attempts, counting the real number down each time", async () => {
    const { env } = fakeEnv();
    await issueOtp(env, "a@example.com");
    for (const attemptsLeft of [4, 3, 2, 1]) {
      expect(await verifyOtp(env, "a@example.com", "000000")).toEqual({
        status: "wrong",
        attemptsLeft,
      });
    }
    expect(await verifyOtp(env, "a@example.com", "000000")).toEqual({
      status: "exhausted",
    });
  });

  it("reports expired when no code was issued", async () => {
    const { env } = fakeEnv();
    expect(await verifyOtp(env, "a@example.com", "123456")).toEqual({
      status: "expired",
    });
  });

  it("never invents an attempt count for an expired or exhausted result", async () => {
    const { env } = fakeEnv();
    const expired = await verifyOtp(env, "a@example.com", "123456");
    expect(expired).not.toHaveProperty("attemptsLeft");

    await issueOtp(env, "b@example.com");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await verifyOtp(env, "b@example.com", "000000");
    }
    const exhausted = await verifyOtp(env, "b@example.com", "000000");
    expect(exhausted).toEqual({ status: "exhausted" });
  });

  it("does not store the code in readable form", async () => {
    const { env, rows } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");
    expect(JSON.stringify([...rows.values()])).not.toContain(code);
  });

  it("does not store the email in readable form", async () => {
    const { env, rows } = fakeEnv();
    await issueOtp(env, "a@example.com");
    expect(JSON.stringify([...rows.keys()])).not.toContain("a@example.com");
  });

  it("does not store a hash of the bare code, so one table cannot cover every account", async () => {
    const { env, rows } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");
    const stored = [...rows.values()][0]!;

    expect(stored.code_hash).not.toBe(await hashToken(code));
    expect(stored.code_hash).toBe(await hashToken(`a@example.com:${code}`));
  });

  it("refuses a record lifted from one email's key onto another's, even with the right code", async () => {
    const { env, rows } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");
    const lifted = [...rows.values()][0]!.code_hash;
    await issueOtp(env, "b@example.com");
    const bKey = [...rows.keys()].find(
      (key) => rows.get(key)!.code_hash !== lifted,
    )!;
    rows.get(bKey)!.code_hash = lifted;

    expect(await verifyOtp(env, "b@example.com", code)).toMatchObject({
      status: "wrong",
    });
  });

  it("accepts the code up to the deadline it was issued with", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T00:00:00Z"));
    const { env } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");
    vi.setSystemTime(new Date("2026-09-03T00:09:00Z"));
    expect(await verifyOtp(env, "a@example.com", code)).toEqual({
      status: "ok",
    });
  });

  it("refuses the code once its ten minutes are up", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T00:00:00Z"));
    const { env } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");
    vi.setSystemTime(new Date("2026-09-03T00:10:01Z"));
    expect(await verifyOtp(env, "a@example.com", code)).toEqual({
      status: "expired",
    });
  });

  it("keeps the first deadline when a wrong code is tried near it", async () => {
    vi.useFakeTimers();
    const issued = new Date("2026-09-03T00:00:00Z").getTime();
    vi.setSystemTime(issued);
    const { env } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");

    vi.setSystemTime(issued + 9 * MINUTE);
    expect(await verifyOtp(env, "a@example.com", "000000")).toEqual({
      status: "wrong",
      attemptsLeft: 4,
    });

    vi.setSystemTime(issued + 11 * MINUTE);
    expect(
      await verifyOtp(env, "a@example.com", code),
      "a wrong guess must not buy the code another ten minutes",
    ).toEqual({ status: "expired" });
  });

  it("gives a fresh deadline to a code issued after the first one lapsed", async () => {
    vi.useFakeTimers();
    const issued = new Date("2026-09-03T00:00:00Z").getTime();
    vi.setSystemTime(issued);
    const { env } = fakeEnv();
    await issueOtp(env, "a@example.com");

    vi.setSystemTime(issued + 11 * MINUTE);
    const second = await issueOtp(env, "a@example.com");
    vi.setSystemTime(issued + 20 * MINUTE);
    expect(await verifyOtp(env, "a@example.com", second)).toEqual({
      status: "ok",
    });
  });

  it("counts exactly five wrong guesses even when they arrive together", async () => {
    const { env } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");
    const together = await Promise.all(
      Array.from({ length: 9 }, () =>
        verifyOtp(env, "a@example.com", "000000"),
      ),
    );

    const counted = together
      .filter((one) => one.status === "wrong")
      .map((one) => one.attemptsLeft)
      .sort();

    expect(
      counted,
      "a shared read would report the same remaining count to every caller",
    ).toEqual([1, 2, 3, 4]);
    expect(await verifyOtp(env, "a@example.com", code)).toEqual({
      status: "exhausted",
    });
  });

  it("lets exactly one of two simultaneous correct submissions through", async () => {
    const { env } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");
    const both = await Promise.all([
      verifyOtp(env, "a@example.com", code),
      verifyOtp(env, "a@example.com", code),
    ]);

    expect(both.filter((one) => one.status === "ok")).toHaveLength(1);
    expect(both.filter((one) => one.status === "expired")).toHaveLength(1);
  });

  it("burns the code once it is accepted", async () => {
    const { env } = fakeEnv();
    const code = await issueOtp(env, "a@example.com");
    await verifyOtp(env, "a@example.com", code);
    expect(await verifyOtp(env, "a@example.com", code)).toEqual({
      status: "expired",
    });
  });
});
