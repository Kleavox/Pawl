import { ApiError, apiFetch } from "@pawl/core";
import { Field, Form, Kbd, Note, Title, ViewButton } from "@pawl/ui";
import { useState, type FormEvent, type ReactNode } from "react";

import { redirectToFreshChallenge } from "../helpers";
import {
  begin,
  failed,
  Frame,
  SCREEN_FORM,
  signedOut,
  signOutVia,
  usePass,
} from "./context";

export function SecurityStep(): ReactNode {
  const pass = usePass();
  return (
    <Frame
      name="security"
      labelledBy="security-title"
      foot={
        <>
          <Kbd>CLR</Kbd> back
        </>
      }
    >
      <Title id="security-title">Security</Title>
      <ViewButton
        tone="go"
        disabled={pass.state.busy}
        onClick={() => void signOutVia(pass, "/api/logout")}
      >
        Sign out
      </ViewButton>
      <ViewButton
        disabled={pass.state.busy}
        onClick={() => void signOutVia(pass, "/api/sessions/revoke-all")}
      >
        Sign out everywhere
      </ViewButton>
      <ViewButton
        tone="danger"
        onClick={() => pass.dispatch({ type: "open", view: "delete" })}
      >
        Delete this account
      </ViewButton>
    </Frame>
  );
}

export function DeleteStep(): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "delete";
  const [email, setEmail] = useState("");
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    setEmail("");
  }

  async function remove(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pass.state.busy || email === "") return;
    begin(pass);
    try {
      await apiFetch("/api/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmEmail: email }),
      });
      signedOut(pass);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "challenge_failed") {
        redirectToFreshChallenge();
        return;
      }
      failed(pass, cause);
    }
  }

  return (
    <Frame
      name="delete"
      labelledBy="delete-title"
      foot={
        <>
          <Kbd go>GO</Kbd> delete · <Kbd>CLR</Kbd> back
        </>
      }
    >
      <Title id="delete-title">Delete this account</Title>
      <Note aside>
        Everything goes, and every app is asked to erase its copy.
      </Note>
      <Form
        id={shown ? SCREEN_FORM : undefined}
        onSubmit={(event) => void remove(event)}
      >
        <Field
          label="Email"
          id="confirm-delete-email"
          name="confirm-delete-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-autofocus
          action={
            <ViewButton
              tone="danger"
              type="submit"
              disabled={pass.state.busy || email === ""}
            >
              Delete forever
            </ViewButton>
          }
        />
      </Form>
    </Frame>
  );
}
