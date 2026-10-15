interface CardField {
  label: string;
  value: string;
  copy: boolean;
}

export interface Card {
  title: string;
  message: string;
  fields: CardField[];
  action: { label: string; href: string } | null;
}

export const CARD_LIMITS = {
  title: 40,
  message: 90,
  fields: 2,
  label: 20,
  value: 70,
  action: 16,
  bytes: 16 * 1024,
  waitMs: 5000,
} as const;

const CONTROL = /\p{Cc}/u;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

function words(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const length = [...value].length;
  if (length === 0 || length > max || CONTROL.test(value)) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readField(value: unknown): CardField | null {
  if (!isRecord(value)) return null;
  const label = words(value.label, CARD_LIMITS.label);
  const shown = words(value.value, CARD_LIMITS.value);
  if (label === null || shown === null) return null;
  if (value.copy !== undefined && typeof value.copy !== "boolean") return null;
  return { label, value: shown, copy: value.copy === true };
}

function readAction(
  value: unknown,
  origin: string,
): Card["action"] | undefined {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return undefined;
  const label = words(value.label, CARD_LIMITS.action);
  if (label === null || typeof value.href !== "string") return undefined;
  try {
    return new URL(value.href).origin === origin
      ? { label, href: value.href }
      : undefined;
  } catch {
    return undefined;
  }
}

export function readCard(answer: unknown, origin: string): Card | null {
  if (!isRecord(answer)) return null;
  const title = words(answer.title, CARD_LIMITS.title);
  if (title === null) return null;
  let message = "";
  if (answer.message !== undefined && answer.message !== "") {
    const said = words(answer.message, CARD_LIMITS.message);
    if (said === null) return null;
    message = said;
  }
  let fields: CardField[] = [];
  if (answer.fields !== undefined) {
    if (
      !Array.isArray(answer.fields) ||
      answer.fields.length > CARD_LIMITS.fields
    ) {
      return null;
    }
    const read = answer.fields.map(readField);
    if (read.some((field) => field === null)) return null;
    fields = read as CardField[];
  }
  const action = readAction(answer.action, origin);
  if (action === undefined) return null;
  return { title, message, fields, action };
}

async function capped(response: Response, max: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const whole = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(whole);
}

export async function askCard(
  fetch: Fetch,
  origin: string,
  token: string,
): Promise<Card | null> {
  try {
    const response = await fetch(`${origin}/.well-known/pawl/card`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(CARD_LIMITS.waitMs),
    });
    if (response.status !== 200) return null;
    const body = await capped(response, CARD_LIMITS.bytes);
    if (body === null) return null;
    return readCard(JSON.parse(body) as unknown, origin);
  } catch {
    return null;
  }
}
