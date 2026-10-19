import type { ReactNode } from "react";

import { EFFECTIVE } from "../legal-facts";

export type ReceiptFacts = {
  siteName: string;
  rootHost: string;
  passHost: string;
  contact: string;
};

export function Privacy({
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
        <h1 id="receipt-title">Privacy policy</h1>
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
        aria-labelledby="privacy-short"
      >
        <h2 id="privacy-short">In one breath</h2>
        <p>
          {siteName} keeps what it needs to sign you in and keep your account
          safe: your email address, a username, and a proof of your password
          that cannot be turned back into it. Nothing is used for advertising
          and nothing is sold. You can see every app you let in, revoke any of
          them, and delete your account yourself, at any time.
        </p>
      </section>
      <section aria-labelledby="privacy-1">
        <h2 id="privacy-1">1. Who runs this machine</h2>
        <p>
          {siteName} at {rootHost}, including the sign-in pages at {passHost},
          is run by the operator of {rootHost}
          {' ("we", "us"). We decide what is collected and why. Write to '}
          <a href={`mailto:${contact}`}>{contact}</a> with any question or
          request about your data.
        </p>
      </section>
      <section aria-labelledby="privacy-2">
        <h2 id="privacy-2">2. What your account holds</h2>
        <ul>
          <li>Your email address and whether you have verified it.</li>
          <li>
            Your username, and your role (an ordinary visitor or the owner).
          </li>
          <li>
            The ways you sign in: a password, and, if you linked them, the
            account identifier Google or GitHub gives us for you.
          </li>
          <li>When the account was created and when you last signed in.</li>
          <li>
            A password verifier. Your password never reaches our servers: your
            browser derives a one-way verifier from it, and only that verifier
            is stored. We cannot read or recover your password.
          </li>
          <li>
            An encryption key pair. Its private half is locked in your browser
            with a key derived from your password before it is stored, so we
            hold it but cannot open it.
          </li>
        </ul>
      </section>
      <section aria-labelledby="privacy-3">
        <h2 id="privacy-3">3. Signing in with Google or GitHub</h2>
        <p>
          If you choose Google, we ask only for the scopes{" "}
          <code>openid email profile</code>: an identifier for your Google
          account, your email address and whether Google has verified it, and
          your name, which we read but do not keep. If you choose GitHub, we ask
          for <code>read:user user:email</code>: your public profile and your
          email addresses, of which we keep only the account identifier and one
          verified address. We use these only to create your account or sign you
          in to it. We do not post anything, read anything else, or keep the
          access Google or GitHub gives us beyond finishing the sign-in. This
          information is not sold and is never used for advertising.
        </p>
      </section>
      <section aria-labelledby="privacy-4">
        <h2 id="privacy-4">4. Sessions and security records</h2>
        <ul>
          <li>
            {
              "A session for each device you sign in on: your browser's user agent, the IP address it was created from, and when it started. You see all three under Account → Devices. A session and what it holds last 7 days, or until you sign out or revoke it there."
            }
          </li>
          <li>
            {
              'Sign-in and account events (for example "signed in", "password changed") with your browser\'s user agent and a salted hash of your IP address; these records keep the hash, not the address.'
            }
          </li>
          <li>
            Rate-limit counters keyed by a hash, which expire within an hour, so
            that nobody can guess passwords or codes at speed.
          </li>
          <li>
            Codes we email you are stored as hashes for 10 minutes;
            email-verification links last 30 minutes and password-reset links 15
            minutes, also stored only as hashes.
          </li>
          <li>
            A human check by Cloudflare Turnstile before you create an account
            or reset a password.
          </li>
        </ul>
      </section>
      <section aria-labelledby="privacy-5">
        <h2 id="privacy-5">5. Apps you sign in to with {siteName}</h2>
        <p>
          When an app asks to sign you in with {siteName}, it receives only what
          you allow on the consent screen: an identifier for you (a different
          one for each outside app, so apps cannot match you between them) and,
          with the matching scopes, your verified email address and your
          username. Apps run by the operator of {rootHost}
          {
            " also learn your role. Every app you have allowed is listed under Account → Apps, where you can disconnect it. Sign-in codes handed to an app last 60 seconds, the tokens it receives last 10 minutes, and the refresh tokens an outside app may hold last 30 days. Each app's own privacy policy covers what it does with what it receives."
          }
        </p>
      </section>
      <section aria-labelledby="privacy-6">
        <h2 id="privacy-6">6. Cookies and browser storage</h2>
        <p>
          Every cookie here is strictly necessary to sign you in and keep you
          signed in. There are no analytics, tracking or advertising cookies.
        </p>
        <table className="receipt__table w-full mt-[6px] mb-[10px] border-collapse font-pw-mono text-rem-label leading-[1.45] [&_th]:pt-[7px] [&_th]:pr-[6px] [&_th]:pb-[7px] [&_th]:pl-0 [&_th]:[border-bottom:1px_dashed_var(--pw-paper-rule)] [&_th]:text-left [&_th]:align-top [&_th]:text-pw-paper-dim [&_th]:font-extrabold [&_th]:tracking-[0.08em] [&_th]:uppercase [&_td]:pt-[7px] [&_td]:pr-[6px] [&_td]:pb-[7px] [&_td]:pl-0 [&_td]:[border-bottom:1px_dashed_var(--pw-paper-rule)] [&_td]:text-left [&_td]:align-top [&&_code]:[background:none] [&&_code]:p-0 max-desk:[&_thead]:hidden max-desk:[&_tr]:grid max-desk:[&_tr]:py-[6px] max-desk:[&_tr]:[border-bottom:1px_dashed_var(--pw-paper-rule)] max-desk:[&_td]:py-[2px] max-desk:[&_td]:px-0 max-desk:[&_td]:[border:0]">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">What it does</th>
              <th scope="col">Lasts</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>__Secure-pawl_session</code>
              </td>
              <td>Your session at {passHost}</td>
              <td>7 days without use, never more than 30 days</td>
            </tr>
            <tr>
              <td>
                <code>pawl-signed-in</code>
              </td>
              <td>
                Says only that this browser is signed in at {passHost}, so{" "}
                {rootHost} asks it only then
              </td>
              <td>30 days, or until you sign out</td>
            </tr>
            <tr>
              <td>
                <code>__Host-pawl_device</code>
              </td>
              <td>
                Remembers up to three accounts that signed in on this browser,
                so they skip the extra check while someone is trying many
                passwords
              </td>
              <td>1 year</td>
            </tr>
            <tr>
              <td>
                <code>__Secure-pawl_verified</code>
              </td>
              <td>Remembers that you passed the human check</td>
              <td>24 hours, or 30 minutes for sensitive steps</td>
            </tr>
            <tr>
              <td>
                <code>__Secure-pawl_oauth</code>
              </td>
              <td>Ties a Google or GitHub sign-in to your browser</td>
              <td>10 minutes</td>
            </tr>
            <tr>
              <td>
                <code>__Host-session</code>
              </td>
              <td>Your session on {rootHost} and each app</td>
              <td>As long as your session at {passHost}</td>
            </tr>
            <tr>
              <td>
                <code>__Host-signin</code>
              </td>
              <td>A sign-in in progress</td>
              <td>10 minutes</td>
            </tr>
            <tr>
              <td>
                <code>__Host-silent</code>
              </td>
              <td>Stops the machine asking twice whether you are signed in</td>
              <td>Until you close the browser</td>
            </tr>
            <tr>
              <td>
                <code>pawl:sound</code>
              </td>
              <td>Your choice for the keypad sound (local storage)</td>
              <td>Until you clear it</td>
            </tr>
            <tr>
              <td>
                <code>pawl:machine-request</code>
              </td>
              <td>The bay you asked for while signing in (session storage)</td>
              <td>Until you close the tab</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section aria-labelledby="privacy-7">
        <h2 id="privacy-7">7. Who processes data for us</h2>
        <ul>
          <li>
            <strong>Cloudflare</strong> runs the machine (Workers), stores
            accounts and sessions (D1 and KV), and provides the Turnstile human
            check, under its{" "}
            <a
              href="https://www.cloudflare.com/privacypolicy/"
              rel="noopener noreferrer"
            >
              privacy policy
            </a>{" "}
            and{" "}
            <a
              href="https://www.cloudflare.com/turnstile-privacy-policy/"
              rel="noopener noreferrer"
            >
              Turnstile addendum
            </a>
            .
          </li>
          <li>
            <strong>Resend</strong> delivers the emails we send you: codes,
            verification and reset links.
          </li>
          <li>
            <strong>Google</strong> and <strong>GitHub</strong>, only when you
            choose to sign in with them.
          </li>
        </ul>
        <p>
          Cloudflare operates worldwide, so your data may be processed in any
          country where it runs, including outside your own.
        </p>
      </section>
      <section aria-labelledby="privacy-8">
        <h2 id="privacy-8">8. How long we keep it</h2>
        <p>
          Your account and everything tied to it stays until you delete the
          account. Sessions, codes, links and counters expire on their own as
          described above. Security events are kept to protect the service; when
          an account is deleted they stay without the link to it.
        </p>
      </section>
      <section aria-labelledby="privacy-9">
        <h2 id="privacy-9">9. Your choices</h2>
        <ul>
          <li>See and correct your details under Account → Profile.</li>
          <li>Sign out any device under Account → Devices.</li>
          <li>Disconnect any app under Account → Apps.</li>
          <li>
            Delete your account under Account → Security → Delete this account.
            It removes your identities, keys, sessions, app grants and tokens;
            apps that keep data for your account are told to erase it first.
          </li>
          <li>
            Ask for a copy of your data, or anything else about it, at{" "}
            <a href={`mailto:${contact}`}>{contact}</a>. We answer within 30
            days. You may also complain to the data protection authority where
            you live.
          </li>
        </ul>
      </section>
      <section aria-labelledby="privacy-10">
        <h2 id="privacy-10">10. Security</h2>
        <p>
          Every connection is encrypted over HTTPS. Passwords never leave your
          browser; secrets we must keep are stored as hashes; private keys are
          encrypted before they leave your device. No system is perfectly
          secure, and we will tell affected people promptly if something goes
          wrong.
        </p>
      </section>
      <section aria-labelledby="privacy-11">
        <h2 id="privacy-11">11. Children</h2>
        <p>
          {siteName} is not meant for anyone under 13, or under the age your
          country sets for consenting to online services if that is higher (16
          in parts of Europe).
        </p>
      </section>
      <section aria-labelledby="privacy-12">
        <h2 id="privacy-12">12. Changes to this policy</h2>
        <p>
          When this policy changes in a way that matters, the effective date at
          the top of this receipt changes with it.
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
          Also printed: <a href="/terms.html">Terms of service</a>
        </p>
      </div>
    </>
  );
}
