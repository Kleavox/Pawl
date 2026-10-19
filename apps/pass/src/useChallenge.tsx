import { Turnstile } from "@marsidev/react-turnstile";
import { ApiError } from "@pawl/core";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { PW_LINK } from "@pawl/ui";

import { api, turnstileSiteKey } from "./helpers";

interface ChallengeController {
  ready: boolean;
  failed: boolean;
  ensure: () => Promise<void>;
  retry: () => void;
  widget: ReactNode;
}

export function useChallenge(
  options: {
    scope?: "basic" | "fresh";
    returnTo?: string | null;
    skipStatusCheck?: boolean;
    onComplete?: (target: string) => void;
    active?: boolean;
  } = {},
): ChallengeController {
  const {
    scope = "fresh",
    returnTo = null,
    skipStatusCheck = false,
    onComplete,
    active = true,
  } = options;
  const [status, setStatus] = useState<
    "checking" | "pending" | "ready" | "error"
  >("checking");
  const [attempt, setAttempt] = useState(0);
  const statusRef = useRef(status);
  const submitted = useRef(false);
  const waiters = useRef<
    Array<{ resolve: () => void; reject: (cause: Error) => void }>
  >([]);

  const move = (next: "checking" | "pending") => {
    statusRef.current = next;
    setStatus(next);
  };

  const settle = (next: "ready" | "error") => {
    statusRef.current = next;
    setStatus(next);
    const pending = waiters.current.splice(0);
    for (const waiter of pending) {
      if (next === "ready") waiter.resolve();
      else waiter.reject(new Error("The security check failed. Try again."));
    }
  };

  async function submitToken(token: string) {
    const response = await api<{ ok: true; returnTo: string }>(
      "/api/challenge",
      { token, scope, returnTo: returnTo ?? undefined },
    );
    if (onComplete) {
      onComplete(response.returnTo);
      return;
    }
    settle("ready");
  }

  async function onToken(token?: string) {
    if (!token || submitted.current) return;
    submitted.current = true;
    try {
      await submitToken(token);
    } catch {
      submitted.current = false;
      settle("error");
    }
  }

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    move("checking");
    submitted.current = false;
    void (async () => {
      try {
        if (!skipStatusCheck) {
          const current = await api<{ verified: boolean }>(
            `/api/challenge/status?scope=${scope}`,
          );
          if (cancelled) return;
          if (current.verified) {
            settle("ready");
            return;
          }
        }
        if (turnstileSiteKey) {
          if (!cancelled) move("pending");
          return;
        }
        await submitToken("dev-fallback");
      } catch {
        if (!cancelled) settle("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, active]);

  const ensure = () => {
    if (statusRef.current === "ready") return Promise.resolve();
    const wait = new Promise<void>((resolve, reject) => {
      const waiter = { resolve, reject };
      waiters.current.push(waiter);
      setTimeout(() => {
        const index = waiters.current.indexOf(waiter);
        if (index >= 0) {
          waiters.current.splice(index, 1);
          reject(
            new Error("The security check is taking too long. Try again."),
          );
        }
      }, 20_000);
    });
    if (statusRef.current === "error") setAttempt((value) => value + 1);
    return wait;
  };

  const retry = () => {
    statusRef.current = "checking";
    setAttempt((value) => value + 1);
  };

  const widget =
    status === "ready" ? null : (
      <div
        className="challenge-inline text-pw-ink-dim text-14"
        aria-live="polite"
      >
        {status === "error" ? (
          <button className={PW_LINK} type="button" onClick={retry}>
            Security check failed, retry
          </button>
        ) : (
          <span className="sr-only">Security check…</span>
        )}
        {status === "pending" && turnstileSiteKey && (
          <span className="turnstile-invisible block">
            <Turnstile
              key={attempt}
              siteKey={turnstileSiteKey}
              onSuccess={onToken}
              onExpire={() => {
                submitted.current = false;
              }}
              options={{ size: "invisible", appearance: "interaction-only" }}
            />
          </span>
        )}
      </div>
    );

  return {
    ready: status === "ready",
    failed: status === "error",
    ensure,
    retry,
    widget,
  };
}

export function useHumanCheck(shown: boolean): {
  checked: <T>(run: () => Promise<T>) => Promise<T>;
  widget: ReactNode;
} {
  const [asked, setAsked] = useState(false);
  const challenge = useChallenge({
    active: shown && asked,
    scope: "basic",
    skipStatusCheck: true,
  });

  async function checked<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.code !== "challenge_required") {
        throw cause;
      }
      if (asked) challenge.retry();
      setAsked(true);
      await challenge.ensure();
      return run();
    }
  }

  return { checked, widget: shown && asked ? challenge.widget : null };
}
