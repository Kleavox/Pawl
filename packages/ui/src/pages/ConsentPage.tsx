import {
  ACTIONS,
  BUTTON,
  BUTTON_PRIMARY,
  EYEBROW,
  HEADING,
  renderMachinePage,
  TEXT,
} from "./MachinePage";

export type ConsentPageOptions = {
  clientName: string;
  sector: string;
  holder: string;
  scopes: readonly string[];
  query: string;
  rootOrigin: string;
  siteName: string;
  action?: string;
  fields?: Readonly<Record<string, string>>;
};

const SCOPES = "scopes grid gap-8 m-0 p-0 list-none";

const SCOPE =
  "flex gap-10 items-start py-10 px-12 border-[length:--spacing(1)] border-solid border-pw-screen-line rounded-[--spacing(6)] bg-pw-screen-hi text-pw-ink before:content-['✓'] before:grid before:place-items-center before:flex-none before:size-20 before:rounded-[--spacing(4)] before:bg-pw-cobalt before:text-pw-white before:[font:700_--spacing(14)/1_var(--pw-ui)]";

export function renderConsentPage(options: ConsentPageOptions): string {
  const name = options.clientName;
  return renderMachinePage({
    title: `Sign in to ${name} with Pawl`,
    status: "AN APP WANTS YOUR PASS",
    sub: "NOTHING SHARED YET",
    where: "CONSENT",
    rootOrigin: options.rootOrigin,
    siteName: options.siteName,
    caption: "CLR DENY · GO ALLOW",
    keys: {
      clr: { kind: "submit", form: "consent", name: "decision", value: "deny" },
      go: { kind: "submit", form: "consent", name: "decision", value: "allow" },
    },
    children: (
      <>
        <p className={EYEBROW}>Consent</p>
        <h1 className={HEADING}>{`Sign in to ${name} with Pawl`}</h1>
        <p className={TEXT}>
          {name} is registered to <strong>{options.sector}</strong>. You are
          signed in as <strong>{options.holder}</strong>.
        </p>
        <p className={TEXT}>If you allow it, {name} receives:</p>
        <ul className={SCOPES}>
          {options.scopes.map((scope) => (
            <li key={scope} className={SCOPE}>
              {scope}
            </li>
          ))}
        </ul>
        <p className={TEXT}>
          It is asked once. You can disconnect it any time under Account → Apps.
        </p>
        <form
          id="consent"
          className={ACTIONS}
          method="post"
          action={options.action ?? "/oauth/consent"}
        >
          {Object.entries(options.fields ?? { request: options.query }).map(
            ([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ),
          )}
          <button className={BUTTON} type="submit" name="decision" value="deny">
            Deny
          </button>
          <button
            className={BUTTON_PRIMARY}
            type="submit"
            name="decision"
            value="allow"
          >
            Allow
          </button>
        </form>
      </>
    ),
  });
}
