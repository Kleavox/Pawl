import type { Indicator, Severity } from "./nav-counts";

export function padClass(severity: Severity): string {
  return severity === "danger" ? "pw-pad pw-pad-danger" : "pw-pad pw-pad-warn";
}

export function displayFor(indicator: Indicator | undefined): string | null {
  if (indicator === undefined || indicator === "locked") return null;
  if (indicator === "unknown") return "--";
  return String(indicator.count);
}

export function severityFor(indicator: Indicator | undefined): Severity | null {
  if (indicator === undefined || indicator === "locked") return null;
  if (indicator === "unknown") return "warn";
  return indicator.severity;
}

export function nameFor(
  label: string,
  noun: string,
  indicator: Indicator | undefined,
): string {
  if (indicator === undefined) return label;
  if (indicator === "locked") return `${label}, locked`;
  if (indicator === "unknown") return `${label}, unknown`;
  return `${label}, ${indicator.count} ${noun}`;
}
