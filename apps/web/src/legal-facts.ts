export const EFFECTIVE = "12 October 2026";

export function contactAddress(rootHost: string): string {
  return `privacy@${rootHost.replace(/:\d+$/u, "")}`;
}
