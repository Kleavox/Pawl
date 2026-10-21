import { Eyebrow, Loader } from "@pawl/ui";
import type { ReactNode } from "react";

import { SignedIn } from "./Account";
import { Frame, usePass } from "./context";
import { CodeStep, EmailStep } from "./EmailCode";
import { Methods } from "./Methods";
import { ForgotStep, PasswordStep } from "./Password";
import { RegisterKeyStep, RegisterStep, SentStep } from "./Register";
import { ChallengeStep, LinkStep, ResetStep, VerifyStep } from "./Results";
import { useCanSetPassword, WelcomeKeyStep, WelcomeStep } from "./Welcome";

function Loading(): ReactNode {
  return (
    <Frame name="loading" label="Reading your pass" foot="reading your pass">
      <Eyebrow>Reading pass</Eyebrow>
      <Loader />
    </Frame>
  );
}

export function Screens(): ReactNode {
  const pass = usePass();
  const canSetPassword = useCanSetPassword(
    pass.user !== null && !pass.user.username,
  );
  return (
    <>
      <Loading />
      <Methods />
      <EmailStep />
      <CodeStep />
      <PasswordStep />
      <ForgotStep />
      <RegisterStep />
      <RegisterKeyStep />
      <SentStep />
      <WelcomeStep canSetPassword={canSetPassword} />
      <WelcomeKeyStep />
      <VerifyStep />
      <ResetStep />
      <LinkStep />
      <ChallengeStep />
      {pass.user?.username ? <SignedIn user={pass.user} /> : null}
    </>
  );
}
