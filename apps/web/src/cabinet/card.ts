import { REQUEST_TIMEOUT_MS } from "@pawl/core";

export type AppCard = {
  title: string;
  message: string;
  fields: { label: string; value: string; copy: boolean }[];
  action: { label: string; href: string } | null;
};

export type CardState =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "connect"; href: string }
  | { kind: "shown"; card: AppCard }
  | { kind: "unreadable" }
  | { kind: "expired" };

export type CardStep =
  | { kind: "leave"; href: string; word: string }
  | { kind: "retry"; word: string }
  | { kind: "sign-in"; word: string };

const UNREADABLE: CardState = { kind: "unreadable" };

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isCard(value: unknown): value is AppCard {
  if (typeof value !== "object" || value === null) return false;
  const card = value as Record<string, unknown>;
  const action = card.action as Record<string, unknown> | null | undefined;
  return (
    isText(card.title) &&
    isText(card.message) &&
    Array.isArray(card.fields) &&
    card.fields.every(
      (field: unknown) =>
        typeof field === "object" &&
        field !== null &&
        isText((field as Record<string, unknown>).label) &&
        isText((field as Record<string, unknown>).value) &&
        typeof (field as Record<string, unknown>).copy === "boolean",
    ) &&
    (action === null ||
      (typeof action === "object" &&
        isText(action.label) &&
        isText(action.href)))
  );
}

export async function readCardFor(key: string): Promise<CardState> {
  try {
    const response = await fetch(`/api/apps/${encodeURIComponent(key)}/card`, {
      credentials: "include",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (response.status === 401) return { kind: "expired" };
    if (response.status === 409) {
      return isText(body.connect)
        ? { kind: "connect", href: body.connect }
        : UNREADABLE;
    }
    if (response.ok && isCard(body.card)) {
      return { kind: "shown", card: body.card };
    }
    return UNREADABLE;
  } catch {
    return UNREADABLE;
  }
}

export function cardStep(state: CardState): CardStep | null {
  switch (state.kind) {
    case "connect":
      return { kind: "leave", href: state.href, word: "Connect" };
    case "shown":
      return state.card.action === null
        ? null
        : {
            kind: "leave",
            href: state.card.action.href,
            word: state.card.action.label,
          };
    case "unreadable":
      return { kind: "retry", word: "Try again" };
    case "expired":
      return { kind: "sign-in", word: "Sign in again" };
    default:
      return null;
  }
}
