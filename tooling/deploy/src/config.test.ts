import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_MANIFEST } from "@pawl/registry";
import { initRegistryFromDisk } from "@pawl/registry/node";
import { COMPATIBILITY_DATE } from "@pawl/topology";
import { beforeAll, describe, expect, it } from "vitest";

import { localConfigs, productionConfigs, productionSecrets } from "./config";

const FIXTURE = readFileSync(
  new URL("../../e2e/fixture/estate.json", import.meta.url),
  "utf8",
);

beforeAll(() => {
  initRegistryFromDisk();
});

const env = {
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  APP_ROOT_DOMAIN: "product.test",
  WORKER_PREFIX: "product",
  PASS_D1_ID: "11111111-1111-1111-1111-111111111111",
  PASS_KV_ID: "11111111111111111111111111111111",
  AUTH_FROM_EMAIL: "Product <no-reply@product.test>",
  GATEWAY_CLIENT_ID: "gateway",
};

describe("production deployment config", () => {
  it("keeps static Wrangler configs on the shared compatibility date", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    for (const worker of ["pass", "gateway"]) {
      const source = readFileSync(
        path.join(root, "workers", worker, "wrangler.jsonc"),
        "utf8",
      );
      expect(source).toContain(`"compatibility_date": "${COMPATIBILITY_DATE}"`);
    }
  });

  it("renders route-free staging configs", () => {
    const configs = productionConfigs(env, "none", EMPTY_MANIFEST);
    expect(configs["pass"]?.routes).toBeUndefined();
    expect(configs["gateway"]?.routes).toBeUndefined();
    expect(configs["pass"]?.vars).toMatchObject({ ENVIRONMENT: "production" });
  });

  it("derives canonical domains and resource names from environment", () => {
    const configs = productionConfigs(env, "canonical", EMPTY_MANIFEST);
    expect(configs["gateway"]?.routes).toEqual([
      { pattern: "product.test", custom_domain: true },
      { pattern: "www.product.test", custom_domain: true },
    ]);
    expect(configs["pass"]?.routes).toEqual([
      { pattern: "paw.product.test", custom_domain: true },
      { pattern: "pass.product.test", custom_domain: true },
    ]);
    expect(configs["pass"]?.vars).toMatchObject({
      PUBLIC_ORIGIN: "https://paw.product.test",
    });
    expect(Object.keys(configs)).toEqual(["pass", "gateway"]);
    expect(configs["gateway"]?.services).toEqual([
      { binding: "PASS", service: "product-pass" },
    ]);
  });

  it("makes the gateway a client of Pawl's provider on its public origin", () => {
    const configs = productionConfigs(env, "canonical", EMPTY_MANIFEST);
    expect(configs["gateway"]?.vars).toMatchObject({
      OIDC_ISSUER: "https://paw.product.test",
      OIDC_CLIENT_ID: "gateway",
    });
  });

  it("refuses to render a gateway that has no client of its own", () => {
    const { GATEWAY_CLIENT_ID, ...clientless } = env;
    expect(GATEWAY_CLIENT_ID).toBe("gateway");
    expect(() =>
      productionConfigs(
        clientless as unknown as typeof env,
        "none",
        EMPTY_MANIFEST,
      ),
    ).toThrow(/GATEWAY_CLIENT_ID/u);
  });

  it("refuses placeholder resource ids", () => {
    expect(() =>
      productionConfigs(
        {
          ...env,
          PASS_D1_ID: "00000000-0000-0000-0000-000000000000",
        },
        "none",
        EMPTY_MANIFEST,
      ),
    ).toThrow(/PASS_D1_ID/u);
  });

  it("demands no id for a database it never renders", () => {
    expect(env).not.toHaveProperty("LINK_D1_ID");
    expect(env).not.toHaveProperty("PULSE_D1_ID");
    expect(env).not.toHaveProperty("DROP_BUCKET_NAME");
    expect(() => productionConfigs(env, "none", EMPTY_MANIFEST)).not.toThrow();
  });

  it("lets the pass Worker answer its OIDC paths before the app shell, here and locally", () => {
    const assets = productionConfigs(env, "none", EMPTY_MANIFEST)["pass"]
      ?.assets as {
      run_worker_first: string[];
    };
    expect(assets.run_worker_first).toEqual(
      expect.arrayContaining(["/oauth/*", "/.well-known/*"]),
    );
    const local = readFileSync(
      path.join(
        fileURLToPath(new URL("../../../", import.meta.url)),
        "workers/pass/wrangler.jsonc",
      ),
      "utf8",
    );
    expect(local).toContain('"/oauth/*"');
    expect(local).toContain('"/.well-known/*"');
  });

  it("rate limits the pass Worker's authorize and token endpoints natively", () => {
    const limits = productionConfigs(env, "none", EMPTY_MANIFEST)["pass"]
      ?.ratelimits as {
      name: string;
    }[];
    expect(limits.map((limit) => limit.name)).toEqual([
      "AUTHORIZE_RATE_LIMIT",
      "TOKEN_RATE_LIMIT",
    ]);
  });

  it("lets a local suite's silent sign-ins through, and keeps production's authorize limit tight", () => {
    type Limit = { name: string; simple: { limit: number } };
    const limitOf = (limits: unknown) =>
      (limits as Limit[]).find((limit) => limit.name === "AUTHORIZE_RATE_LIMIT")
        ?.simple.limit;
    expect(
      limitOf(
        productionConfigs(env, "none", EMPTY_MANIFEST)["pass"]?.ratelimits,
      ),
    ).toBe(30);
    expect(limitOf(localConfigs(FIXTURE, "key")["pass"]?.ratelimits)).toBe(
      1000,
    );
  });

  it("ignores unrelated runner environment variables", () => {
    const runnerEnvironment = { ...env, DOTNET_MULTILEVEL_LOOKUP: "0" };
    expect(() =>
      productionConfigs(runnerEnvironment, "none", EMPTY_MANIFEST),
    ).not.toThrow();
  });
});

describe("apps from the manifest", () => {
  it("binds the gateway to every routed app and nothing else", () => {
    const services = productionConfigs(env, "none", FIXTURE)["gateway"]
      ?.services;
    expect(services).toEqual([
      { binding: "PASS", service: "product-pass" },
      { binding: "APP_NOTES", service: "product-notes" },
      { binding: "APP_DOCS", service: "product-docs" },
    ]);
  });

  it("binds the pass Worker to every app it must purge", () => {
    expect(productionConfigs(env, "none", FIXTURE)["pass"]?.services).toEqual([
      { binding: "APP_NOTES", service: "product-notes" },
    ]);
  });

  it("hands both Workers the validated manifest", () => {
    const configs = productionConfigs(env, "none", FIXTURE);
    for (const worker of ["pass", "gateway"]) {
      const vars = configs[worker]?.vars as { ESTATE_MANIFEST: string };
      expect(JSON.parse(vars.ESTATE_MANIFEST).apps).toHaveLength(2);
    }
  });

  it("refuses an invalid manifest before rendering anything", () => {
    expect(() =>
      productionConfigs(env, "none", '{"site":{"name":""}}'),
    ).toThrow(/site name/);
  });

  it("names no app when none is registered", () => {
    const services = productionConfigs(
      env,
      "none",
      '{"site":{"name":"Pawl"},"apps":[]}',
    )["gateway"]?.services;
    expect(services).toEqual([{ binding: "PASS", service: "product-pass" }]);
  });

  it("renders local configs bound to local services, with a throwaway signing key", () => {
    const local = localConfigs(FIXTURE, "local-key");
    expect(local["gateway"]?.services).toContainEqual({
      binding: "APP_NOTES",
      service: "local-notes",
    });
    expect(
      (local["pass"]?.vars as { OIDC_SIGNING_KEY: string }).OIDC_SIGNING_KEY,
    ).toBe("local-key");
    expect(local["gateway"]?.vars).toMatchObject({
      OIDC_ISSUER: "http://127.0.0.1:8787",
      OIDC_CLIENT_ID: "gateway",
      OIDC_CLIENT_SECRET: "local-gateway-secret",
    });
  });
});

describe("production secrets", () => {
  const secrets = {
    RESEND_API_KEY: "resend",
    TURNSTILE_SECRET_KEY: "turnstile",
    IP_HASH_SECRET: "audit",
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GITHUB_CLIENT_ID: "github-id",
    GITHUB_CLIENT_SECRET: "github-secret",
    OIDC_SIGNING_KEY: "signing",
    OIDC_SUB_SECRET: "pairwise",
    GATEWAY_CLIENT_SECRET: "gateway-secret",
  };

  it("uses generic repository secret names as Worker bindings", () => {
    const result = productionSecrets(secrets);
    expect(result.pass.RESEND_API_KEY).toBe("resend");
    expect(result.pass.OIDC_SIGNING_KEY).toBe("signing");
    expect(result.pass).not.toHaveProperty("OIDC_PREVIOUS_SIGNING_KEY");
    expect(Object.keys(result)).toEqual(["pass", "gateway"]);
    expect(result.gateway).toEqual({ OIDC_CLIENT_SECRET: "gateway-secret" });
  });

  it("carries the previous signing key only while one is set", () => {
    const result = productionSecrets({
      ...secrets,
      OIDC_PREVIOUS_SIGNING_KEY: "previous",
    });
    expect(result.pass.OIDC_PREVIOUS_SIGNING_KEY).toBe("previous");
  });

  it("refuses to render a gateway that could not exchange a code", () => {
    const { GATEWAY_CLIENT_SECRET, ...secretless } = secrets;
    expect(GATEWAY_CLIENT_SECRET).toBe("gateway-secret");
    expect(() => productionSecrets(secretless)).toThrow(
      /GATEWAY_CLIENT_SECRET/u,
    );
  });

  it("refuses to render a Pawl that could sign nothing", () => {
    const { OIDC_SIGNING_KEY, ...keyless } = secrets;
    expect(OIDC_SIGNING_KEY).toBe("signing");
    expect(() => productionSecrets(keyless)).toThrow(/OIDC_SIGNING_KEY/u);
  });
});
