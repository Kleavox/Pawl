import type { ReactNode } from "react";

import type { Mode } from "./types";

export const SCREEN_FORM = "screen-form";

const MODES: readonly Mode[] = ["login", "register", "forgot"];
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function initialMode(search: string): Mode {
  const wanted = new URLSearchParams(search).get("mode");
  return MODES.find((mode) => mode === wanted) ?? "login";
}

export type Holder = { handle: string; role: "ADMIN" | "USER" };

function chipWord(holder: Holder | null): string {
  if (holder === null) return "GUEST MODE";
  return holder.role === "ADMIN" ? "OWNER MODE" : "VISITOR MODE";
}

function chipState(holder: Holder | null): string {
  if (holder === null) return "guest";
  return holder.role === "ADMIN" ? "owner" : "visitor";
}

export function Machine({
  siteName,
  rootOrigin,
  status,
  sub,
  hint,
  go,
  back,
  holder,
  children,
}: {
  siteName: string;
  rootOrigin: string;
  status: string;
  sub?: string;
  hint?: string;
  go: boolean;
  back?: () => void;
  holder: Holder | null;
  children: ReactNode;
}) {
  const site = siteName.toUpperCase();
  return (
    <main className="room room--panel" aria-label={`${siteName} account`}>
      <div className="close-up" data-camera data-access={chipState(holder)}>
        <div className="close-up__glass" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="close-up__machine">
          <div className="pw-marquee close-up__marquee">
            <span className="pw-marquee__brand close-up__brand">{site}</span>
            <span
              className="pw-chip close-up__chip"
              data-cabinet-state={chipState(holder)}
            >
              <span className="pw-chip__lamp" aria-hidden="true" />
              <span>{chipWord(holder)}</span>
            </span>
          </div>
          <section className="close-up__panel" aria-label="Service panel">
            <div className="pw-bezel">
              <div className="pw-lcd close-up__screen">
                <p
                  className="pw-lcd__status"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span>{status}</span>
                  {sub ? <small>{sub}</small> : null}
                </p>
                <div className="close-up__view">{children}</div>
                <p className="pw-lcd__hint" aria-hidden="true">
                  {hint ?? (
                    <>
                      <span>
                        <kbd>CLR</kbd> back
                      </span>
                      <span>
                        <kbd className="is-go">GO</kbd> continue
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="close-up__controls">
              <div
                className="pw-keypad close-up__keypad"
                role="group"
                aria-label="Keypad"
              >
                <span className="pw-keypad__mode">SERVICE KEYS</span>
                {DIGITS.map((digit) => (
                  <span
                    className="pw-key is-unlit"
                    aria-hidden="true"
                    key={digit}
                  >
                    {digit}
                  </span>
                ))}
                <button
                  className="pw-key close-up__clr"
                  type="button"
                  disabled={back === undefined}
                  onClick={back}
                >
                  CLR
                </button>
                <span className="pw-key is-unlit" aria-hidden="true">
                  0
                </span>
                {go ? (
                  <button
                    className="pw-key pw-key--go"
                    type="submit"
                    form={SCREEN_FORM}
                  >
                    GO
                  </button>
                ) : (
                  <button className="pw-key pw-key--go" type="button" disabled>
                    GO
                  </button>
                )}
              </div>
              <div className="close-up__reader" aria-hidden="true">
                <span className="close-up__slot" />
                {holder ? (
                  <span className="pawl-card">
                    <span className="pawl-card__brand">{site}</span>
                    <span className="pawl-card__chip" />
                    <span className="pawl-card__holder">
                      <span>{holder.handle}</span>
                      <span className="pawl-card__role">
                        {holder.role === "ADMIN"
                          ? "OWNER PASS"
                          : "VISITOR PASS"}
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="close-up__dock">PASS DOCK · EMPTY</span>
                )}
              </div>
              <div className="pw-printer close-up__printer" aria-hidden="true">
                <span className="pw-printer__slot" />
                <span>RECEIPTS</span>
              </div>
              <div className="close-up__service" aria-hidden="true">
                <span className="pw-grille">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className="close-up__engraving">
                  SERVICE PANEL · {site}
                </span>
              </div>
            </div>
          </section>
          <div className="pw-plate close-up__plate">
            <span className="pw-plate__serial">PAWL-GW-01</span>
            <span className="pw-plate__links">
              <a href={`${rootOrigin}/`}>Machine</a>
              <span className="pw-plate__dot" aria-hidden="true">
                ·
              </span>
              <a href={`${rootOrigin}/privacy.html`}>Privacy</a>
              <span className="pw-plate__dot" aria-hidden="true">
                ·
              </span>
              <a href={`${rootOrigin}/terms.html`}>Terms</a>
              <span className="pw-plate__dot" aria-hidden="true">
                ·
              </span>
              <span>
                © {new Date().getFullYear()} {siteName}
              </span>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
