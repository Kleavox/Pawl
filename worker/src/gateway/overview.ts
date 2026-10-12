type Severity = "warn" | "danger";
type AttentionAge = "elapsed" | "remaining";

export interface AttentionItem {
  kind: string;
  severity: Severity;
  title: string;
  detail: string;
  since: string;
  age: AttentionAge;
  href: string;
}

export interface EstatePart {
  count: number;
  severity: Severity | null;
  attention: AttentionItem[];
}

export interface PassSummary {
  devices: number;
}

type Block = { count: number; severity: Severity | null };

export interface Estate {
  role: "ADMIN" | "USER";
  tools: Record<string, Block | "locked" | null>;
  attention: AttentionItem[];
}

const SEVERITY_ORDER: Record<Severity, number> = { danger: 0, warn: 1 };
const URGENCY_WINDOW_MS = 6 * 60 * 60 * 1000;

function isSeverity(value: unknown): value is Severity {
  return value === "warn" || value === "danger";
}

function isAttention(value: unknown, origin: string): value is AttentionItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.kind === "string" &&
    isSeverity(item.severity) &&
    typeof item.title === "string" &&
    typeof item.detail === "string" &&
    typeof item.since === "string" &&
    !Number.isNaN(Date.parse(item.since)) &&
    (item.age === "elapsed" || item.age === "remaining") &&
    typeof item.href === "string" &&
    (item.href === origin || item.href.startsWith(`${origin}/`))
  );
}

export function readEstate(answer: unknown, origin: string): EstatePart | null {
  if (typeof answer !== "object" || answer === null) return null;
  const { count, severity, attention } = answer as Record<string, unknown>;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0)
    return null;
  if (severity !== null && !isSeverity(severity)) return null;
  if (!Array.isArray(attention)) return null;
  return {
    count,
    severity,
    attention: attention.filter((item): item is AttentionItem =>
      isAttention(item, origin),
    ),
  };
}

function urgency(item: AttentionItem, now: number): number {
  const at = Date.parse(item.since);
  return item.age === "remaining"
    ? URGENCY_WINDOW_MS - Math.max(0, at - now)
    : Math.max(0, now - at);
}

export function buildEstate(
  role: "ADMIN" | "USER",
  pass: PassSummary | null,
  parts: Record<string, EstatePart | "locked" | null>,
): Estate {
  const tools: Estate["tools"] = {
    pass: pass ? { count: pass.devices, severity: null } : null,
  };
  const attention: AttentionItem[] = [];
  for (const [key, part] of Object.entries(parts)) {
    if (part === null || part === "locked") {
      tools[key] = part;
      continue;
    }
    tools[key] = { count: part.count, severity: part.severity };
    attention.push(...part.attention);
  }
  const now = Date.now();
  attention.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      urgency(b, now) - urgency(a, now),
  );
  return { role, tools, attention };
}
