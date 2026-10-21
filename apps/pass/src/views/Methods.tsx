import { Choice, Choices, Kbd, Note, PW_LINK, Title } from "@pawl/ui";
import { useEffect, useState, type ReactNode } from "react";

import { methodChoices, type Method } from "../flow";
import { oauthErrorMessage, startOAuth } from "../helpers";
import { Frame, usePass, type Pass } from "./context";

const LABEL: Record<Method, { mark: string; label: string }> = {
  google: { mark: "G", label: "Continue with Google" },
  github: { mark: "GH", label: "Continue with GitHub" },
  email: { mark: "@", label: "Email me a code" },
  password: { mark: "**", label: "Use a password" },
};

export function choose(pass: Pass, method: Method): void {
  if (method === "google" || method === "github") {
    startOAuth(method);
    return;
  }
  pass.dispatch({ type: "open", view: method });
}

export function Methods(): ReactNode {
  const pass = usePass();
  const choices = methodChoices(pass.providers);
  const [oauth, setOauth] = useState<ReturnType<
    typeof oauthErrorMessage
  > | null>(null);
  useEffect(() => {
    setOauth(
      oauthErrorMessage(
        new URLSearchParams(window.location.search).get("oauthError"),
      ),
    );
  }, []);
  return (
    <Frame
      name="methods"
      labelledBy="methods-title"
      foot={
        <>
          <Kbd>1</Kbd>–<Kbd>{String(choices.length)}</Kbd> pick
        </>
      }
    >
      <Title id="methods-title">Sign in to {pass.siteName}</Title>
      <Choices>
        {choices.map(({ key, method }, index) => (
          <Choice
            key={method}
            keyLabel={key}
            mark={LABEL[method].mark}
            label={LABEL[method].label}
            data-method={method}
            data-autofocus={index === 0 ? "" : undefined}
            onClick={() => choose(pass, method)}
          />
        ))}
      </Choices>
      {oauth === null ? null : (
        <Note tone={oauth.kind === "info" ? "plain" : "tries"} aside>
          {oauth.text}
        </Note>
      )}
      <Note tone="line" aside>
        No account?{" "}
        <button
          className={PW_LINK}
          type="button"
          onClick={() => pass.dispatch({ type: "open", view: "register" })}
        >
          Create one
        </button>
      </Note>
    </Frame>
  );
}
