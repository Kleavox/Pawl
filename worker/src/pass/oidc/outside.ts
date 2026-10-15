import {
  EMPTY_MANIFEST,
  Registry,
  withOutsideApps,
  type Access,
} from "@pawl/registry";

import type { Env } from "../env";
import { hashToken, randomToken } from "../lib/crypto";

export interface OutsideApp {
  key: string;
  label: string;
  title: string;
  origin: string;
  access: Access;
  card: boolean;
  clientId: string;
  redirectUri: string;
  createdAt: string;
}

export interface NewOutsideApp {
  title: string;
  label: string;
  address: string;
  returnTo: string | null;
  access: Access;
  card: boolean;
}

export type Registration =
  | { kind: "created"; app: OutsideApp; secret: string }
  | { kind: "invalid"; message: string };

interface AppRow {
  key: string;
  label: string;
  title: string;
  origin: string;
  access: Access;
  card: number;
  client_id: string;
  redirect_uris: string;
  created_at: string;
}

const SCOPES = ["openid", "email", "profile"];
const ACCESS: readonly Access[] = ["public", "visitor", "owner"];
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LABEL = /^[a-z][a-z0-9-]{0,11}$/u;
const KEY = /^[a-z][a-z0-9]{1,15}$/u;

const SELECT = `SELECT a.key, a.label, a.title, a.origin, a.access, a.card,
                       a.client_id, c.redirect_uris, a.created_at
                FROM outside_apps a
                JOIN oauth_clients c ON c.id = a.client_id`;

function toApp(row: AppRow): OutsideApp {
  return {
    key: row.key,
    label: row.label,
    title: row.title,
    origin: row.origin,
    access: row.access,
    card: row.card === 1,
    clientId: row.client_id,
    redirectUri: (JSON.parse(row.redirect_uris) as string[])[0] ?? "",
    createdAt: row.created_at,
  };
}

function parsed(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function servable(url: URL): boolean {
  return (
    (url.protocol === "https:" ||
      (url.protocol === "http:" && LOOPBACK.has(url.hostname))) &&
    url.username === "" &&
    url.password === ""
  );
}

function originOf(address: string): string | null {
  const url = parsed(address.trim());
  if (url === null || !servable(url)) return null;
  if (url.pathname !== "/" || url.search !== "" || address.includes("#")) {
    return null;
  }
  return url.origin;
}

function returnAddress(value: string): string | null {
  const trimmed = value.trim();
  const url = parsed(trimmed);
  if (url === null || !servable(url)) return null;
  if (trimmed.includes("#") || trimmed.includes("*")) return null;
  return url.toString();
}

function printable(value: string, max: number): boolean {
  const count = [...value].length;
  return count > 0 && count <= max && !/\p{Cc}/u.test(value);
}

export async function listOutsideApps(env: Env): Promise<OutsideApp[]> {
  const rows = await env.DB.prepare(
    `${SELECT} ORDER BY a.created_at, a.key`,
  ).all<AppRow>();
  return rows.results.map(toApp);
}

export async function findOutsideApp(
  env: Env,
  key: string,
): Promise<OutsideApp | null> {
  const row = await env.DB.prepare(`${SELECT} WHERE a.key = ? LIMIT 1`)
    .bind(key)
    .first<AppRow>();
  return row === null ? null : toApp(row);
}

export async function outsideAppForClient(
  env: Env,
  clientId: string,
): Promise<OutsideApp | null> {
  const row = await env.DB.prepare(`${SELECT} WHERE a.client_id = ? LIMIT 1`)
    .bind(clientId)
    .first<AppRow>();
  return row === null ? null : toApp(row);
}

function invalid(message: string): Registration {
  return { kind: "invalid", message };
}

export async function registerOutsideApp(
  env: Env,
  input: NewOutsideApp,
  createdBy: string,
): Promise<Registration> {
  const title = input.title.trim();
  if (!printable(title, 32)) {
    return invalid("Give the app a name of 1 to 32 characters.");
  }
  const label = input.label.trim();
  const key = label.replaceAll("-", "");
  if (!LABEL.test(label) || !KEY.test(key)) {
    return invalid(
      "The label is 2 to 12 lowercase letters, digits or dashes, starting with a letter.",
    );
  }
  const origin = originOf(input.address);
  if (origin === null) {
    return invalid(
      "The address is https:// and the app's host name, with nothing after it.",
    );
  }
  const redirectUri = returnAddress(
    input.returnTo === null || input.returnTo.trim() === ""
      ? `${origin}/auth/callback`
      : input.returnTo,
  );
  if (redirectUri === null) {
    return invalid(
      "The return address must be an https:// address with no # part.",
    );
  }
  if (!ACCESS.includes(input.access)) {
    return invalid("Choose who may take it: anyone, visitors or the owner.");
  }
  const taken = await env.DB.prepare(
    "SELECT id FROM oauth_clients WHERE id = ? LIMIT 1",
  )
    .bind(key)
    .first<{ id: string }>();
  if (taken !== null) {
    return invalid(`An app called ${label} is already known to Pawl.`);
  }
  const candidate = {
    key,
    label,
    title,
    origin,
    access: input.access,
    card: input.card,
  };
  try {
    new Registry(
      withOutsideApps(env.ESTATE_MANIFEST ?? EMPTY_MANIFEST, [
        ...(await listOutsideApps(env)),
        candidate,
      ]),
    );
  } catch (cause) {
    const first = String(cause instanceof Error ? cause.message : cause)
      .split("\n")[0]
      ?.replace(/^Error: /u, "");
    return invalid(`That clashes with an app Pawl already has: ${first}.`);
  }

  const secret = randomToken();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO oauth_clients
       (id, name, redirect_uris, allowed_scopes, confidential, first_party,
        secret_hash, sector, approved_at)
       VALUES (?, ?, ?, ?, 1, 0, ?, ?, datetime('now'))`,
    ).bind(
      key,
      title,
      JSON.stringify([redirectUri]),
      JSON.stringify(SCOPES),
      await hashToken(secret),
      new URL(redirectUri).host,
    ),
    env.DB.prepare(
      `INSERT INTO outside_apps
       (key, label, title, origin, access, client_id, card, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      key,
      label,
      title,
      origin,
      input.access,
      key,
      input.card ? 1 : 0,
      createdBy,
    ),
  ]);
  const app = await findOutsideApp(env, key);
  if (app === null) throw new Error("The outside app was not stored.");
  return { kind: "created", app, secret };
}

export async function removeOutsideApp(
  env: Env,
  key: string,
): Promise<boolean> {
  const app = await findOutsideApp(env, key);
  if (app === null) return false;
  await env.DB.prepare("DELETE FROM oauth_clients WHERE id = ?")
    .bind(app.clientId)
    .run();
  return true;
}
