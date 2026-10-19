import type { Identity } from "@pawl/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import {
  createSession,
  deleteSession,
  deleteSessionById,
  getSession,
  invalidateUserSessions,
  listSessions,
  putIdentityOverride,
} from "./session";

class MemoryKv {
  readonly values = new Map<string, string>();
  readonly metadata = new Map<string, unknown>();

  async get(
    key: string,
    type?: "text" | "json",
  ): Promise<string | unknown | null> {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(
    key: string,
    value: string,
    options?: { metadata?: unknown },
  ): Promise<void> {
    this.values.set(key, value);
    if (options?.metadata !== undefined) {
      this.metadata.set(key, options.metadata);
    }
  }

  async getWithMetadata(key: string) {
    return {
      value: this.values.get(key) ?? null,
      metadata: this.metadata.get(key) ?? null,
    };
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
    this.metadata.delete(key);
  }

  async list({ prefix = "" }: { prefix?: string } = {}) {
    return {
      keys: [...this.values.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name, metadata: this.metadata.get(name) })),
    };
  }
}

const noAccounts = {
  prepare: () => ({ bind: () => ({ first: async () => null }) }),
} as unknown as D1Database;

const identity: Identity = {
  id: "user-1",
  email: "person@example.com",
  username: "person",
  role: "USER",
};

describe("sessions", () => {
  it("stores only a hash of the opaque browser token", async () => {
    const kv = new MemoryKv();
    const env = {
      SESSIONS: kv as unknown as KVNamespace,
      DB: noAccounts,
    } as Env;
    const created = await createSession(env, identity, 1);

    expect([...kv.values.keys()]).not.toContain(`session:${created.token}`);
    await expect(getSession(env, created.token)).resolves.toMatchObject({
      identity,
    });
  });

  it("invalidates every old session when auth version changes", async () => {
    const kv = new MemoryKv();
    const env = {
      SESSIONS: kv as unknown as KVNamespace,
      DB: noAccounts,
    } as Env;
    const created = await createSession(env, identity, 1);

    await invalidateUserSessions(env, identity.id, 2);
    await expect(getSession(env, created.token)).resolves.toBeNull();
  });

  it("deletes an individual session", async () => {
    const kv = new MemoryKv();
    const env = {
      SESSIONS: kv as unknown as KVNamespace,
      DB: noAccounts,
    } as Env;
    const created = await createSession(env, identity, 1);

    await deleteSession(env, created.token);
    await expect(getSession(env, created.token)).resolves.toBeNull();
  });

  it("propagates identity changes to every existing session", async () => {
    const kv = new MemoryKv();
    const env = {
      SESSIONS: kv as unknown as KVNamespace,
      DB: noAccounts,
    } as Env;
    const deviceA = await createSession(env, identity, 1);
    const deviceB = await createSession(env, identity, 1);

    await putIdentityOverride(env, { ...identity, username: "renamed_person" });

    await expect(getSession(env, deviceA.token)).resolves.toMatchObject({
      identity: { username: "renamed_person" },
    });
    await expect(getSession(env, deviceB.token)).resolves.toMatchObject({
      identity: { username: "renamed_person" },
    });
  });

  it("takes the role from the account, so a promotion reaches a session made before it", async () => {
    const kv = new MemoryKv();
    const roles = new Map<string, Identity["role"]>([[identity.id, "USER"]]);
    const db = {
      prepare: () => ({
        bind: (id: string) => ({
          first: async () => (roles.has(id) ? { role: roles.get(id) } : null),
        }),
      }),
    };
    const env = {
      SESSIONS: kv as unknown as KVNamespace,
      DB: db as unknown as D1Database,
    } as Env;
    const created = await createSession(env, identity, 1);
    await putIdentityOverride(env, { ...identity, username: "renamed_person" });

    roles.set(identity.id, "ADMIN");
    await expect(getSession(env, created.token)).resolves.toMatchObject({
      identity: { role: "ADMIN", username: "renamed_person" },
    });

    roles.set(identity.id, "USER");
    await expect(getSession(env, created.token)).resolves.toMatchObject({
      identity: { role: "USER" },
    });
  });

  it("keeps the stored identity when no override exists", async () => {
    const kv = new MemoryKv();
    const env = {
      SESSIONS: kv as unknown as KVNamespace,
      DB: noAccounts,
    } as Env;
    const created = await createSession(env, identity, 1);

    await expect(getSession(env, created.token)).resolves.toMatchObject({
      identity: { username: "person" },
    });
  });

  it("lists devices and revokes a single session", async () => {
    const kv = new MemoryKv();
    const env = {
      SESSIONS: kv as unknown as KVNamespace,
      DB: noAccounts,
    } as Env;
    const laptop = await createSession(env, identity, 1, {
      userAgent: "Laptop UA",
      ip: "10.0.0.1",
    });
    const phone = await createSession(env, identity, 1, {
      userAgent: "Phone UA",
      ip: "10.0.0.2",
    });

    const devices = await listSessions(env, identity.id);
    expect(devices).toHaveLength(2);
    expect(devices.map((device) => device.userAgent).sort()).toEqual([
      "Laptop UA",
      "Phone UA",
    ]);

    const phoneId = devices.find(
      (device) => device.userAgent === "Phone UA",
    )!.sessionId;
    await expect(deleteSessionById(env, identity.id, phoneId)).resolves.toBe(
      true,
    );
    await expect(getSession(env, phone.token)).resolves.toBeNull();
    await expect(getSession(env, laptop.token)).resolves.not.toBeNull();
    await expect(listSessions(env, identity.id)).resolves.toHaveLength(1);
  });
});

describe("a session in use", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const start = Date.parse("2026-10-01T00:00:00.000Z");

  afterEach(() => {
    vi.useRealTimers();
  });

  async function made() {
    vi.useFakeTimers({ now: start, toFake: ["Date"] });
    const kv = new MemoryKv();
    const env = {
      SESSIONS: kv as unknown as KVNamespace,
      DB: noAccounts,
    } as Env;
    const created = await createSession(env, identity, 1, {
      userAgent: "Phone UA",
      ip: "10.0.0.2",
    });
    return { kv, env, token: created.token };
  }

  function at(days: number) {
    vi.setSystemTime(start + days * DAY);
  }

  it("lives seven days past its last use", async () => {
    const { env, token } = await made();
    at(5);
    expect((await getSession(env, token))?.expiresAt).toBe(
      new Date(start + 12 * DAY).toISOString(),
    );
    at(11);
    expect(await getSession(env, token)).not.toBeNull();
  });

  it("ends seven days after its last use", async () => {
    const { env, token } = await made();
    at(7.01);
    expect(await getSession(env, token)).toBeNull();
  });

  it("never lives past thirty days", async () => {
    const { env, token } = await made();
    for (const day of [5, 10, 15, 20, 25, 29]) {
      at(day);
      const session = await getSession(env, token);
      expect(Date.parse(session?.expiresAt ?? "")).toBeLessThanOrEqual(
        start + 30 * DAY,
      );
    }
    at(30.01);
    expect(await getSession(env, token)).toBeNull();
  });

  it("is not rewritten while most of its week is left", async () => {
    const { env, token } = await made();
    at(1);
    expect((await getSession(env, token))?.expiresAt).toBe(
      new Date(start + 7 * DAY).toISOString(),
    );
  });

  it("keeps its device entry in step", async () => {
    const { env, token } = await made();
    at(5);
    await getSession(env, token);
    const [device] = await listSessions(env, identity.id);
    expect(device).toMatchObject({
      userAgent: "Phone UA",
      expiresAt: new Date(start + 12 * DAY).toISOString(),
    });
  });
});
