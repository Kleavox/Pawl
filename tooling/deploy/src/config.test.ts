import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPATIBILITY_DATE } from "@pawl/topology";
import { describe, expect, it } from "vitest";

import { productionConfigs, productionSecrets } from "./config";

const env = {
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  APP_ROOT_DOMAIN: "product.test",
  WORKER_PREFIX: "product",
  PASS_D1_ID: "11111111-1111-1111-1111-111111111111",
  PASS_KV_ID: "11111111111111111111111111111111",
  AUTH_FROM_EMAIL: "Product <no-reply@product.test>",
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
    const configs = productionConfigs(env, "none");
    expect(configs["pass"]?.routes).toBeUndefined();
    expect(configs["gateway"]?.routes).toBeUndefined();
    expect(configs["pass"]?.vars).toMatchObject({ ENVIRONMENT: "production" });
  });

  it("derives canonical domains and resource names from environment", () => {
    const configs = productionConfigs(env, "canonical");
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
    expect(configs["portfolio"]).toBeUndefined();
    expect(configs["drop"]).toBeUndefined();
    expect(configs["link"]).toBeUndefined();
    expect(configs["pulse"]).toBeUndefined();
    expect(configs["gateway"]?.services).toEqual([
      { binding: "LINK", service: "product-link" },
      { binding: "PASS", service: "product-pass" },
      { binding: "PORTFOLIO", service: "product-portfolio" },
    ]);
  });

  it("refuses placeholder resource ids", () => {
    expect(() =>
      productionConfigs(
        {
          ...env,
          PASS_D1_ID: "00000000-0000-0000-0000-000000000000",
        },
        "none",
      ),
    ).toThrow(/PASS_D1_ID/u);
  });

  it("demands no id for a database it never renders", () => {
    expect(env).not.toHaveProperty("LINK_D1_ID");
    expect(env).not.toHaveProperty("PULSE_D1_ID");
    expect(env).not.toHaveProperty("DROP_BUCKET_NAME");
    expect(() => productionConfigs(env, "none")).not.toThrow();
  });

  it("lets the pass Worker answer its OIDC paths before the app shell, here and locally", () => {
    const assets = productionConfigs(env, "none")["pass"]?.assets as {
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
    const limits = productionConfigs(env, "none")["pass"]?.ratelimits as {
      name: string;
    }[];
    expect(limits.map((limit) => limit.name)).toEqual([
      "AUTHORIZE_RATE_LIMIT",
      "TOKEN_RATE_LIMIT",
    ]);
  });

  it("ignores unrelated runner environment variables", () => {
    const runnerEnvironment = { ...env, DOTNET_MULTILEVEL_LOOKUP: "0" };
    expect(() => productionConfigs(runnerEnvironment, "none")).not.toThrow();
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
  };

  it("uses generic repository secret names as Worker bindings", () => {
    const result = productionSecrets(secrets);
    expect(result.pass.RESEND_API_KEY).toBe("resend");
    expect(result.pass.OIDC_SIGNING_KEY).toBe("signing");
    expect(result.pass).not.toHaveProperty("OIDC_PREVIOUS_SIGNING_KEY");
    expect(result).not.toHaveProperty("portfolio");
  });

  it("carries the previous signing key only while one is set", () => {
    const result = productionSecrets({
      ...secrets,
      OIDC_PREVIOUS_SIGNING_KEY: "previous",
    });
    expect(result.pass.OIDC_PREVIOUS_SIGNING_KEY).toBe("previous");
  });

  it("refuses to render a Pawl that could sign nothing", () => {
    const { OIDC_SIGNING_KEY, ...keyless } = secrets;
    expect(OIDC_SIGNING_KEY).toBe("signing");
    expect(() => productionSecrets(keyless)).toThrow(/OIDC_SIGNING_KEY/u);
  });
});
