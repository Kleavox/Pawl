import { displayHandle } from "@pawl/core";
import { navCountsFrom, unreadableCounts } from "@pawl/ui";
import type { Indicator, NavCounts, Overview } from "@pawl/ui";
import { permits } from "./machine/state";
import type { AccessRole, BayCode, Catalog } from "./machine/state";
import { emptyTicker, guestTicker } from "./ticker";

export type Session = {
  authenticated: boolean;
  identity?: {
    role?: string;
    username?: string | null;
    email?: string | null;
  };
};

export type MachineModel = {
  access: AccessRole;
  items: { code: BayCode; lit: boolean }[];
  screen: string;
  holder: string | null;
  indicators: Record<string, Indicator> | null;
  ticker: string;
};

function accessFor(session: Session): AccessRole {
  if (!session.authenticated || session.identity?.role === undefined) {
    return "guest";
  }
  if (session.identity.role === "ADMIN") return "owner";
  if (session.identity.role === "USER") return "visitor";
  return "guest";
}

function itemsFor(
  access: AccessRole,
  catalog: Catalog,
): { code: BayCode; lit: boolean }[] {
  return catalog.map(({ code }) => ({
    code,
    lit: permits(access, code, catalog),
  }));
}

function estateFullyRead(
  indicators: NavCounts["indicators"],
  keys: readonly string[],
): boolean {
  return keys.every((key) => indicators[key] !== "unknown");
}

function screenFor(
  access: AccessRole,
  overview: Overview | null,
  counts: NavCounts | null,
  keys: readonly string[],
): string {
  if (access === "guest") return "INSERT PASS";
  if (overview === null || counts === null) return "ESTATE UNREADABLE";
  const full = estateFullyRead(counts.indicators, keys);
  if (overview.attention.length > 0) {
    return full
      ? `${overview.attention.length} NEED ATTENTION`
      : `AT LEAST ${overview.attention.length} NEED ATTENTION`;
  }
  return full ? "NOTHING NEEDS YOU" : "ESTATE UNREADABLE";
}

function indicatorsFor(
  access: AccessRole,
  overview: Overview | null,
  keys: readonly string[],
): Record<string, Indicator> | null {
  if (access === "guest") return null;
  return overview === null
    ? unreadableCounts(keys).indicators
    : navCountsFrom(overview, keys).indicators;
}

function tickerCount(indicator: Indicator | undefined): string {
  if (indicator === undefined || indicator === "unknown") return "--";
  if (indicator === "locked") return "LOCKED";
  return String(indicator.count);
}

function tickerFor(
  access: AccessRole,
  catalog: Catalog,
  screen: string,
  indicators: Record<string, Indicator> | null,
  siteName: string,
): string {
  if (catalog.length === 0) return emptyTicker(siteName);
  if (access === "guest") return guestTicker(siteName);
  const counts = catalog
    .filter((bay) => bay.estate)
    .map((bay) => `${bay.product} ${tickerCount(indicators?.[bay.key])}`);
  return [screen, ...counts].join(" · ");
}

export function toMachineModel(
  session: Session,
  overview: Overview | null,
  catalog: Catalog,
  keys: readonly string[],
  siteName = "Pawl",
): MachineModel {
  const access = accessFor(session);
  const counts = overview !== null ? navCountsFrom(overview, keys) : null;
  const screen = screenFor(access, overview, counts, keys);
  const bayKeys = catalog.filter((bay) => bay.estate).map((bay) => bay.key);
  const indicators = indicatorsFor(access, overview, [
    ...new Set([...keys, ...bayKeys]),
  ]);
  return {
    access,
    items: itemsFor(access, catalog),
    screen,
    holder:
      access === "guest"
        ? null
        : displayHandle(session.identity?.username, session.identity?.email),
    indicators,
    ticker: tickerFor(access, catalog, screen, indicators, siteName),
  };
}
