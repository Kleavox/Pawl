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

export function productionConfigs(
  env: DeployEnvironment,
  domains: DomainMode,
): Record<string, WorkerConfig> {
  validateEnvironment(env);

  const rootDomain = normalizeDomain(env.APP_ROOT_DOMAIN);
  const rootOrigin = `https://${rootDomain}`;
  const prefix = normalizeWorkerPrefix(env.WORKER_PREFIX);
  const canonical = domains === "canonical";
  const names = {
    pass: workerName(prefix, "pass"),
    link: workerName(prefix, "link"),
    portfolio: workerName(prefix, "portfolio"),
    gateway: workerName(prefix, "gateway"),
  };

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
      services: [{ binding: "LINK", service: names.link }],
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
      },
      assets: {
        directory: "../../apps/web/dist",
        binding: "ASSETS",
        not_found_handling: "none",
        run_worker_first: true,
      },
      services: [
        { binding: "LINK", service: names.link },
        { binding: "PASS", service: names.pass },
        { binding: "PORTFOLIO", service: names.portfolio },
      ],
      ...(canonical ? { routes: routes(rootDomain, `www.${rootDomain}`) } : {}),
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
