import type { ReactNode } from "react";
import type { Tool } from "@pawl/registry";

import type { NavCounts } from "./nav-counts";
import { displayFor, nameFor, padClass, severityFor } from "./indicator-view";

export interface AppHeaderProps {
  product?: string;
  rootOrigin?: string;
  counts?: NavCounts | null;
  tools: Tool[];
  siteName: string;
  children?: ReactNode;
}

export function AppHeader({
  product,
  rootOrigin = "/",
  counts,
  tools,
  siteName,
  children,
}: AppHeaderProps) {
  const current = product?.toLowerCase();
  const brand = tools.find((tool) => tool.key === current)?.label ?? current;
  return (
    <header className="pw-header">
      <a className="pw-brand" href={rootOrigin}>
        {siteName.toLowerCase()}
        {current ? <b>/{brand}</b> : null}
      </a>
      <nav className="pw-nav" aria-label={`${siteName} tools`}>
        {tools.map((tool) => {
          const active = current === tool.key;
          const indicator = counts ? counts.indicators[tool.key] : undefined;
          const display = displayFor(indicator);
          const severity = severityFor(indicator);
          const name = active
            ? tool.label
            : nameFor(tool.label, tool.noun, indicator);
          return (
            <a
              key={tool.key}
              href={tool.origin}
              className={active ? "pw-nav-tool is-active" : "pw-nav-tool"}
              aria-current={active ? "page" : undefined}
              aria-label={name}
            >
              <span aria-hidden="true">{tool.label}</span>
              {!active && display !== null ? (
                <span className="pw-nav-count" aria-hidden="true">
                  {display}
                </span>
              ) : null}
              {!active && severity !== null ? (
                <span className={padClass(severity)} aria-hidden="true" />
              ) : null}
            </a>
          );
        })}
      </nav>
      {children}
    </header>
  );
}
