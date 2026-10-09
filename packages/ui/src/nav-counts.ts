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

const CACHE_KEY = "pawl:overview";
const CACHE_MS = 60_000;

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

export function writeCache(overview: Overview, now: number = Date.now()): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, overview }));
  } catch {
    return;
  }
}

function isOverviewShape(value: unknown): value is Overview {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    role?: unknown;
    attention?: unknown;
    tools?: unknown;
  };
  return (
    (candidate.role === "ADMIN" || candidate.role === "USER") &&
    Array.isArray(candidate.attention) &&
    typeof candidate.tools === "object" &&
    candidate.tools !== null &&
    !Array.isArray(candidate.tools)
  );
}

export function readCache(now: number = Date.now()): Overview | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { at, overview } = parsed as { at?: unknown; overview?: unknown };
    if (typeof at !== "number" || !Number.isFinite(at)) return null;
    if (now - at > CACHE_MS) return null;
    if (!isOverviewShape(overview)) return null;
    return overview;
  } catch {
    return null;
  }
}

export async function loadOverview(): Promise<Overview | null> {
  const cached = readCache();
  if (cached !== null) return cached;
  try {
    const response = await fetch("/api/estate", {
      credentials: "include",
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!isOverviewShape(body)) return null;
    writeCache(body);
    return body;
  } catch {
    return null;
  }
}

export async function loadNavCounts(
  keys: readonly string[],
): Promise<NavCounts> {
  const overview = await loadOverview();
  return overview ? navCountsFrom(overview, keys) : unreadableCounts(keys);
}
