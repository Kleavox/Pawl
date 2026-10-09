import path from "node:path";
import { fileURLToPath } from "node:url";

import { registryFor, type Registry } from "@pawl/registry";
import { COMPATIBILITY_DATE, publicHost, workerName } from "@pawl/topology";

export type DomainMode = "none" | "canonical";

export interface DeployEnvironment {
  CLOUDFLARE_ACCOUNT_ID: string;
  APP_ROOT_DOMAIN: string;
  WORKER_PREFIX: string;
  PASS_D1_ID: string;
  PASS_KV_ID: string;
  AUTH_FROM_EMAIL: string;
}

interface Route {
  pattern: string;
  custom_domain: true;
}

type WorkerConfig = Record<string, unknown>;

const base = {
  compatibility_date: COMPATIBILITY_DATE,
  workers_dev: true,
  preview_urls: false,
  observability: { enabled: true },
};

function appServices(
  registry: Registry,
  serviceName: (service: string) => string,
): {
  gateway: { binding: string; service: string }[];
  pass: { binding: string; service: string }[];
} {
  const bindings = registry.bindings().map(({ binding, service }) => ({
    binding,
    service: serviceName(service),
  }));
  const purged = new Set(
    registry.purgeTargets().map((target) => target.binding),
  );
  return {
    gateway: bindings,
    pass: bindings.filter((entry) => purged.has(entry.binding)),
  };
}

export function productionConfigs(
  env: DeployEnvironment,
  domains: DomainMode,
  manifestJson: string,
): Record<string, WorkerConfig> {
  const registry = registryFor(manifestJson);
  validateEnvironment(env);

  const rootDomain = normalizeDomain(env.APP_ROOT_DOMAIN);
  const rootOrigin = `https://${rootDomain}`;
  const prefix = normalizeWorkerPrefix(env.WORKER_PREFIX);
  const canonical = domains === "canonical";
  const names = {
    pass: workerName(prefix, "pass"),
    gateway: workerName(prefix, "gateway"),
  };
  const apps = appServices(registry, (service) => `${prefix}-${service}`);
  const manifest = registry.normalized();

  return {
    pass: {
      ...base,
      account_id: env.CLOUDFLARE_ACCOUNT_ID,
      name: names.pass,
      main: "../../workers/pass/src/index.ts",
      assets: {
        directory: "../../apps/pass/dist",
        binding: "ASSETS",
        not_found_handling: "single-page-application",
        run_worker_first: [
          "/api/*",
          "/internal/*",
          "/oauth/*",
          "/.well-known/*",
          "/health",
          "/ready",
        ],
      },
      vars: {
        ENVIRONMENT: "production",
        PUBLIC_ORIGIN: `https://${publicHost(rootDomain, "pass")}`,
        ROOT_DOMAIN: rootDomain,
        FROM_EMAIL: env.AUTH_FROM_EMAIL,
        ESTATE_MANIFEST: manifest,
      },
      kv_namespaces: [{ binding: "SESSIONS", id: env.PASS_KV_ID }],
      d1_databases: [
        {
          binding: "DB",
          database_name: names.pass,
          database_id: env.PASS_D1_ID,
          migrations_dir: "../../workers/pass/migrations",
        },
      ],
      services: apps.pass,
      ratelimits: [
        rateLimit("AUTHORIZE_RATE_LIMIT", "3401", 30),
        rateLimit("TOKEN_RATE_LIMIT", "3402", 60),
      ],
      ...(canonical
        ? {
            routes: routes(
              publicHost(rootDomain, "pass"),
              `pass.${rootDomain}`,
            ),
          }
        : {}),
    },
    gateway: {
      ...base,
      account_id: env.CLOUDFLARE_ACCOUNT_ID,
      name: names.gateway,
      main: "../../workers/gateway/src/index.ts",
      vars: {
        ENVIRONMENT: "production",
        PUBLIC_ORIGIN: rootOrigin,
        ESTATE_MANIFEST: manifest,
      },
      assets: {
        directory: "../../apps/web/dist",
        binding: "ASSETS",
        not_found_handling: "none",
        run_worker_first: true,
      },
      services: [{ binding: "PASS", service: names.pass }, ...apps.gateway],
      ...(canonical ? { routes: routes(rootDomain, `www.${rootDomain}`) } : {}),
    },
  };
}

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function fromRoot(relative: string): string {
  return path.join(repoRoot, relative);
}

export function localConfigs(
  manifestJson: string,
  signingKey: string,
): Record<string, WorkerConfig> {
  const registry = registryFor(manifestJson);
  const apps = appServices(registry, (service) => `local-${service}`);
  const manifest = registry.normalized();
  const local = {
    compatibility_date: COMPATIBILITY_DATE,
    workers_dev: true,
    preview_urls: false,
    observability: { enabled: true },
    rules: [{ type: "CompiledWasm", globs: ["**/*.wasm"], fallthrough: true }],
  };
  return {
    pass: {
      ...local,
      name: "local-pass",
      main: fromRoot("workers/pass/src/index.ts"),
      vars: {
        ENVIRONMENT: "development",
        PUBLIC_ORIGIN: "http://127.0.0.1:8787",
        ROOT_DOMAIN: "example.test",
        FROM_EMAIL: "Example <no-reply@example.test>",
        ESTATE_MANIFEST: manifest,
        OIDC_SIGNING_KEY: signingKey,
        OIDC_SUB_SECRET: "local-pairwise-secret",
      },
      assets: {
        directory: fromRoot("apps/pass/dist"),
        binding: "ASSETS",
        not_found_handling: "single-page-application",
        run_worker_first: [
          "/api/*",
          "/internal/*",
          "/oauth/*",
          "/.well-known/*",
          "/health",
          "/ready",
        ],
      },
      services: [
        ...apps.pass,
        { binding: "GATEWAY", service: "local-gateway" },
      ],
      ratelimits: [
        rateLimit("AUTHORIZE_RATE_LIMIT", "3401", 30),
        rateLimit("TOKEN_RATE_LIMIT", "3402", 60),
      ],
      kv_namespaces: [
        { binding: "SESSIONS", id: "00000000000000000000000000000000" },
      ],
      d1_databases: [
        {
          binding: "DB",
          database_name: "local-pass",
          database_id: "00000000-0000-0000-0000-000000000000",
          migrations_dir: fromRoot("workers/pass/migrations"),
        },
      ],
    },
    gateway: {
      ...local,
      name: "local-gateway",
      main: fromRoot("workers/gateway/src/index.ts"),
      vars: {
        ENVIRONMENT: "development",
        PUBLIC_ORIGIN: "https://example.test",
        ESTATE_MANIFEST: manifest,
      },
      assets: {
        directory: fromRoot("apps/web/dist"),
        binding: "ASSETS",
        not_found_handling: "none",
        run_worker_first: true,
      },
      services: [{ binding: "PASS", service: "local-pass" }, ...apps.gateway],
    },
  };
}

export function productionSecrets(env: NodeJS.ProcessEnv): {
  pass: Record<string, string>;
} {
  const previous = env.OIDC_PREVIOUS_SIGNING_KEY;
  return {
    pass: {
      ...selectSecrets(env, [
        "RESEND_API_KEY",
        "TURNSTILE_SECRET_KEY",
        "IP_HASH_SECRET",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GITHUB_CLIENT_ID",
        "GITHUB_CLIENT_SECRET",
        "OIDC_SIGNING_KEY",
        "OIDC_SUB_SECRET",
      ]),
      ...(previous ? { OIDC_PREVIOUS_SIGNING_KEY: previous } : {}),
    },
  };
}

function routes(...patterns: string[]): Route[] {
  return patterns.map((pattern) => ({ pattern, custom_domain: true }));
}

function rateLimit(name: string, namespaceId: string, limit: number) {
  return {
    name,
    namespace_id: namespaceId,
    simple: { limit, period: 60 },
  };
}

function validateEnvironment(env: DeployEnvironment) {
  const requiredKeys = [
    "CLOUDFLARE_ACCOUNT_ID",
    "APP_ROOT_DOMAIN",
    "WORKER_PREFIX",
    "PASS_D1_ID",
    "PASS_KV_ID",
    "AUTH_FROM_EMAIL",
  ] as const satisfies readonly (keyof DeployEnvironment)[];

  for (const key of requiredKeys) {
    const value = env[key];
    if (
      !value ||
      /^0+$|00000000-0000-0000-0000-000000000000$/u.test(value) ||
      /^(replace-me|example|example\.com)$/iu.test(value)
    ) {
      throw new Error(`Missing or placeholder deployment value: ${key}`);
    }
  }
}

function normalizeDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/\.$/u, "");
  if (
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
      domain,
    )
  ) {
    throw new Error("APP_ROOT_DOMAIN must be a valid hostname.");
  }
  return domain;
}

function normalizeWorkerPrefix(value: string): string {
  const prefix = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/u.test(prefix)) {
    throw new Error("WORKER_PREFIX must be a valid Worker name prefix.");
  }
  return prefix;
}

function selectSecrets(
  env: NodeJS.ProcessEnv,
  names: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names) {
    const value = env[name];
    if (!value) throw new Error(`Missing deployment secret: ${name}`);
    result[name] = value;
  }
  return result;
}
