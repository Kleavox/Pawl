import { errorCodeCopy } from "@pawl/core";

import { AppFooter } from "./app-footer";
import { AppHeader } from "./app-header";

export interface ErrorScreenProps {
  service?: string;
  code?: string;
  title?: string;
  message?: string;
  homeHref?: string;
  homeLabel?: string;
}

export function ErrorScreen({
  service = "Pawl",
  code,
  title,
  message,
  homeHref = "/",
  homeLabel = "Return to Pawl",
}: ErrorScreenProps) {
  const fallback = errorCodeCopy(code);
  return (
    <div className="pw-error">
      <AppHeader rootOrigin={homeHref} />
      <main className="pw-error-body">
        <small className="pw-error-kicker">{service}</small>
        {code ? (
          <div className="pw-error-code" data-code={code}>
            {code}
          </div>
        ) : null}
        <h1 className="pw-error-title">{title ?? fallback.title}</h1>
        <p className="pw-error-message">{message ?? fallback.message}</p>
        <a className="pw-error-action" href={homeHref}>
          {homeLabel} →
        </a>
      </main>
      <AppFooter />
    </div>
  );
}
