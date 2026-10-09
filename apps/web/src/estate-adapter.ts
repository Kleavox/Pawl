import { navCountsFrom } from "@pawl/ui";
import type { NavCounts, Overview } from "@pawl/ui";
import { permits } from "./machine/state";
import type { AccessRole, BayCode } from "./machine/state";

export type Session = {
  authenticated: boolean;
  identity?: { role?: string };
};

export type MachineModel = {
  access: AccessRole;
  items: { code: BayCode; lit: boolean }[];
  screen: string;
};

const CATALOG: BayCode[] = ["1", "3"];
const INDICATOR_KEYS = ["pass", "link"] as const;

function accessFor(session: Session): AccessRole {
  if (!session.authenticated || session.identity?.role === undefined) {
    return "guest";
  }
  if (session.identity.role === "ADMIN") return "owner";
  if (session.identity.role === "USER") return "visitor";
  return "guest";
}

function itemsFor(access: AccessRole): { code: BayCode; lit: boolean }[] {
  return CATALOG.map((code) => ({ code, lit: permits(access, code) }));
}

function estateFullyRead(indicators: NavCounts["indicators"]): boolean {
  return INDICATOR_KEYS.every((key) => indicators[key] !== "unknown");
}

function screenFor(
  access: AccessRole,
  overview: Overview | null,
  counts: NavCounts | null,
): string {
  if (access === "guest") return "INSERT PASS";
  if (overview === null || counts === null) return "ESTATE UNREADABLE";
  const full = estateFullyRead(counts.indicators);
  if (overview.attention.length > 0) {
    return full
      ? `${overview.attention.length} NEED ATTENTION`
      : `AT LEAST ${overview.attention.length} NEED ATTENTION`;
  }
  return full ? "NOTHING NEEDS YOU" : "ESTATE UNREADABLE";
}

export function toMachineModel(
  session: Session,
  overview: Overview | null,
): MachineModel {
  const access = accessFor(session);
  const counts = overview !== null ? navCountsFrom(overview) : null;
  return {
    access,
    items: itemsFor(access),
    screen: screenFor(access, overview, counts),
  };
}
