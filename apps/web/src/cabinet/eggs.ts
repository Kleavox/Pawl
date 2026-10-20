export const LUCKY_ODDS = 50;
export const LUCKY = "7777";
export const ROLL_MS = 1600;
export const ROLL_TICK_MS = 80;
export const LUCKY_HOLD_MS = 4000;
export const ROCK_MS = 600;
export const ROCK_HOLD_MS = 3000;
export const KONAMI_HOLD_MS = 3000;
export const TAPS = 5;
export const TAP_WINDOW_MS = 2000;

export const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;

function digit(random: () => number): number {
  return Math.min(9, Math.floor(random() * 10));
}

export function rollFace(random: () => number): string {
  return [0, 1, 2, 3].map(() => digit(random)).join("");
}

export function rollResult(random: () => number): string {
  if (random() < 1 / LUCKY_ODDS) return LUCKY;
  const digits = [0, 1, 2, 3].map(() => digit(random));
  if (digits.every((value) => value === digits[0])) {
    digits[3] = (digits[3]! + 1) % 10;
  }
  return digits.join("");
}

export function konamiHeard(
  heard: readonly string[],
  key: string,
): { heard: string[]; done: boolean } {
  const pressed = key.length === 1 ? key.toLowerCase() : key;
  const next = [...heard, pressed].slice(-KONAMI.length);
  const done =
    next.length === KONAMI.length && next.every((k, at) => k === KONAMI[at]);
  return { heard: done ? [] : next, done };
}

export function tapped(times: readonly number[], now: number): number[] {
  return [...times.filter((at) => now - at < TAP_WINDOW_MS), now];
}
