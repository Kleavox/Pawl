const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type AgeDirection = "elapsed" | "remaining";

export function formatAge(
  since: string,
  now: Date = new Date(),
  direction: AgeDirection = "elapsed",
): string {
  const then = Date.parse(since);
  if (Number.isNaN(then)) return "--";
  const delta =
    direction === "remaining" ? then - now.getTime() : now.getTime() - then;
  if (delta < 0) return "--";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  return `${Math.floor(delta / DAY)}d`;
}
