export type Severity = "warn" | "danger";

export type AttentionKind = "abuse-report" | "link-expiring";

export type AttentionAge = "elapsed" | "remaining";

export interface AttentionItem {
  kind: AttentionKind;
  severity: Severity;
  title: string;
  detail: string;
  since: string;
  age: AttentionAge;
  href: string;
}

export interface Overview {
  role: "ADMIN" | "USER";
  pass: { devices: number } | null;
  link: {
    active: number;
    files: number;
    reported: number;
    expiringSoon: number;
  } | null;
  attention: AttentionItem[];
}

export type Indicator =
  "locked" | "unknown" | { count: number; severity: Severity | null };

export interface NavCounts {
  role: "ADMIN" | "USER" | null;
  indicators: {
    pass: Indicator;
    link: Indicator;
  };
}

export const UNREADABLE_COUNTS: NavCounts = {
  role: null,
  indicators: { pass: "unknown", link: "unknown" },
};

const CACHE_KEY = "pawl:overview";
const CACHE_MS = 60_000;

function indicatorFor(
  block: { count: number } | null,
  severity: Severity | null,
  permitted: boolean,
): Indicator {
  if (!permitted) return "locked";
  if (block === null) return "unknown";
  return { count: block.count, severity };
}

export function navCountsFrom(overview: Overview): NavCounts {
  return {
    role: overview.role,
    indicators: {
      pass: indicatorFor(
        overview.pass ? { count: overview.pass.devices } : null,
        null,
        true,
      ),
      link: indicatorFor(
        overview.link ? { count: overview.link.active } : null,
        overview.link !== null && overview.link.expiringSoon > 0
          ? "warn"
          : null,
        true,
      ),
    },
  };
}

export function writeCache(overview: Overview, now: number = Date.now()): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, overview }));
  } catch {
    return;
  }
}

function isBlockOrNull(value: unknown): boolean {
  return value === null || typeof value === "object";
}

function isOverviewShape(value: unknown): value is Overview {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    role?: unknown;
    attention?: unknown;
    pass?: unknown;
    link?: unknown;
  };
  return (
    (candidate.role === "ADMIN" || candidate.role === "USER") &&
    Array.isArray(candidate.attention) &&
    "pass" in candidate &&
    "link" in candidate &&
    isBlockOrNull(candidate.pass) &&
    isBlockOrNull(candidate.link)
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

export async function loadNavCounts(): Promise<NavCounts> {
  const overview = await loadOverview();
  return overview ? navCountsFrom(overview) : UNREADABLE_COUNTS;
}
