import type { ReactNode } from "react";

import { EFFECTIVE } from "../legal-facts";

export type ReceiptFacts = {
  siteName: string;
  rootHost: string;
  passHost: string;
  contact: string;
};

export function Terms({
  siteName,
  rootHost,
  passHost,
  contact,
}: ReceiptFacts): ReactNode {
  return (
    <>
      <div className="receipt__head grid justify-items-center gap-[10px] pb-[18px] [border-bottom:2px_dashed_var(--pw-paper-rule)] text-center">
        <p className="receipt__serial m-0 text-pw-paper-dim font-pw-mono text-rem-label font-bold tracking-[0.18em]">
          PAWL-GW-01 · {siteName.toUpperCase()}
        </p>
        <h1 id="receipt-title">Terms of service</h1>
        <dl className="receipt__meta flex flex-wrap justify-center gap-x-[18px] gap-y-[4px] m-0 font-pw-mono text-rem-label [&_div]:flex [&_div]:gap-[6px] [&_dt]:text-pw-paper-dim [&_dt]:font-bold [&_dt]:tracking-[0.1em] [&_dt]:uppercase [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere]">
          <div>
            <dt>Effective</dt>
            <dd>{EFFECTIVE}</dd>
          </div>
          <div>
            <dt>Site</dt>
            <dd>{rootHost}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>
              <a href={`mailto:${contact}`}>{contact}</a>
            </dd>
          </div>
        </dl>
      </div>
      <section
        className="receipt__summary pt-[14px] px-[16px] pb-[4px] border-2 border-dashed border-pw-paper-rule rounded-[4px] [&&_h2]:text-pw-cobalt-lo"
        aria-labelledby="terms-short"
      >
        <h2 id="terms-short">In one breath</h2>
        <p>
          Use {siteName} honestly, keep your password to yourself, and remember
          that it is the only key to your encrypted data. The machine is offered
          as is, and you can leave whenever you like.
        </p>
      </section>
      <section aria-labelledby="terms-1">
        <h2 id="terms-1">1. Agreement</h2>
        <p>
          By creating an account or signing in to {siteName} at {rootHost} or{" "}
          {passHost}, you accept these terms and the{" "}
          <a href="/privacy.html">privacy policy</a>. If you do not accept them,
          do not use the service.
        </p>
      </section>
      <section aria-labelledby="terms-2">
        <h2 id="terms-2">2. What {siteName} is</h2>
        <p>
          {siteName} is an account and sign-in service and a front door to a set
          of apps. One account signs you in to every app that works with it, and
          the machine on {rootHost} shows those apps as bays you can open. Each
          app is its own service with its own terms.
        </p>
      </section>
      <section aria-labelledby="terms-3">
        <h2 id="terms-3">3. Your account</h2>
        <ul>
          <li>Give an email address you control and keep it current.</li>
          <li>An account is for one person. Do not share it.</li>
          <li>
            You are responsible for what happens under your account. Sign out
            devices you no longer use, under Account → Devices.
          </li>
          <li>Usernames must not impersonate anyone or mislead.</li>
        </ul>
      </section>
      <section aria-labelledby="terms-4">
        <h2 id="terms-4">4. Your password and encrypted data</h2>
        <p>
          Your password never reaches us, so we cannot recover it, and we cannot
          recover anything encrypted with the key it protects. Resetting a
          forgotten password gives your account a new key; data encrypted to the
          old one becomes unreadable by design. Keep your password safe and
          somewhere you will find it.
        </p>
      </section>
      <section aria-labelledby="terms-5">
        <h2 id="terms-5">5. Acceptable use</h2>
        <p>Do not:</p>
        <ul>
          <li>try to get into accounts that are not yours;</li>
          <li>guess passwords or codes, or reuse leaked credentials;</li>
          <li>get around the human check, rate limits or other protections;</li>
          <li>
            attack, overload, scrape or probe the service or the apps behind it;
          </li>
          <li>use the service to break the law or to harm others.</li>
        </ul>
      </section>
      <section aria-labelledby="terms-6">
        <h2 id="terms-6">6. Apps you connect</h2>
        <p>
          {
            "When you allow an app to sign you in, it receives only what the consent screen shows. That app's own terms and privacy policy govern what it does next. You can disconnect any app at any time under Account → Apps."
          }
        </p>
      </section>
      <section aria-labelledby="terms-7">
        <h2 id="terms-7">7. Signing in with Google or GitHub</h2>
        <p>
          If you sign in with Google or GitHub, their terms apply to your
          account with them. If either suspends your account there, you may need
          another way to sign in here, such as a password or an email code.
        </p>
      </section>
      <section aria-labelledby="terms-8">
        <h2 id="terms-8">8. Availability and changes to the service</h2>
        <p>
          The service is provided as is and as available. We may change, pause
          or retire features or apps, and we do not promise any level of uptime.
        </p>
      </section>
      <section aria-labelledby="terms-9">
        <h2 id="terms-9">9. Ending your account</h2>
        <p>
          You can delete your account at any time under Account → Security →
          Delete this account. We may suspend or close accounts used against
          section 5, or when the law requires it, and will tell you where we
          can.
        </p>
      </section>
      <section aria-labelledby="terms-10">
        <h2 id="terms-10">10. Disclaimer</h2>
        <p>
          To the extent the law allows, the service comes without warranties of
          any kind, express or implied, including fitness for a particular
          purpose and uninterrupted or error-free operation.
        </p>
      </section>
      <section aria-labelledby="terms-11">
        <h2 id="terms-11">11. Limitation of liability</h2>
        <p>
          To the extent the law allows, we are not liable for indirect or
          consequential losses, or for loss of data you could not decrypt
          because a password was lost. Nothing here limits liability that the
          law does not allow to be limited.
        </p>
      </section>
      <section aria-labelledby="terms-12">
        <h2 id="terms-12">12. Changes to these terms</h2>
        <p>
          When these terms change in a way that matters, the effective date at
          the top of this receipt changes with it. Using the service after that
          date means you accept the new terms.
        </p>
      </section>
      <section aria-labelledby="terms-13">
        <h2 id="terms-13">13. Contact</h2>
        <p>
          Questions about these terms:{" "}
          <a href={`mailto:${contact}`}>{contact}</a>.
        </p>
      </section>
      <div className="receipt__end grid justify-items-center gap-[14px] mt-[34px] pt-[22px] [border-top:2px_dashed_var(--pw-paper-rule)] text-center">
        <p className="receipt__keep m-0 font-pw-mono text-rem-small font-extrabold tracking-[0.2em]">
          — KEEP THIS RECEIPT —
        </p>
        <span
          className="receipt__barcode w-[min(280px,80%)] h-[46px] [background:repeating-linear-gradient(90deg,var(--pw-paper-ink)_0_2px,transparent_2px_4px,var(--pw-paper-ink)_4px_5px,transparent_5px_8px,var(--pw-paper-ink)_8px_11px,transparent_11px_13px)] opacity-85"
          aria-hidden="true"
        />
        <p className="receipt__other text-rem-small">
          Also printed: <a href="/privacy.html">Privacy policy</a>
        </p>
      </div>
    </>
  );
}
