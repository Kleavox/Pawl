export type Severity = "warn" | "danger";

export type AttentionAge = "elapsed" | "remaining";

export interface AttentionItem {
  kind: string;
  severity: Severity;
  title: string;
  detail: string;
  since: string;
  age: AttentionAge;
  href: string;
}

type Block = { count: number; severity: Severity | null };

export interface Overview {
  role: "ADMIN" | "USER";
  tools: Record<string, Block | "locked" | null>;
  attention: AttentionItem[];
}

export type Indicator = "locked" | "unknown" | Block;

export interface NavCounts {
  role: "ADMIN" | "USER" | null;
  indicators: Record<string, Indicator>;
}

export function unreadableCounts(keys: readonly string[]): NavCounts {
  return {
    role: null,
    indicators: Object.fromEntries(keys.map((key) => [key, "unknown"])),
  };
}

function indicatorFor(block: Block | "locked" | null | undefined): Indicator {
  if (block === "locked") return "locked";
  if (block === null || block === undefined) return "unknown";
  return { count: block.count, severity: block.severity };
}

export function navCountsFrom(
  overview: Overview,
  keys: readonly string[],
): NavCounts {
  return {
    role: overview.role,
    indicators: Object.fromEntries(
      keys.map((key) => [key, indicatorFor(overview.tools[key])]),
    ),
  };
}
