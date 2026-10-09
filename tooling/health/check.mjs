import { publicOrigin } from "@pawl/topology";

const rootDomain = requiredEnvironment("APP_ROOT_DOMAIN");
const origins = {
  gateway: process.env.GATEWAY_ORIGIN ?? publicOrigin(rootDomain, "gateway"),
  pass: process.env.PASS_ORIGIN ?? publicOrigin(rootDomain, "pass"),
  link: process.env.LINK_ORIGIN ?? publicOrigin(rootDomain, "link"),
  portfolio:
    process.env.PORTFOLIO_ORIGIN ?? publicOrigin(rootDomain, "portfolio"),
};

const checks = [
  {
    name: "Gateway",
    url: `${origins.gateway}/health`,
    accept: jsonStatus("gateway", ["ok"]),
  },
  {
    name: "Pass readiness",
    url: `${origins.pass}/ready`,
    accept: jsonStatus("pass", ["ready"]),
  },
  {
    name: "Pass OAuth",
    url: `${origins.pass}/api/oauth/providers`,
    accept: async (response) => {
      const value = await response.json();
      return (
        typeof value.google === "boolean" && typeof value.github === "boolean"
      );
    },
  },
  {
    name: "Link",
    url: `${origins.link}/api/session`,
    accept: anonymousSession,
  },
  {
    name: "Drop",
    url: `${origins.link}/api/drop/session`,
    accept: async (response) => {
      const value = await response.json();
      return (
        typeof value.authenticated === "boolean" &&
        typeof value.policy?.maxFileBytes === "number" &&
        Array.isArray(value.policy?.retentionOptions)
      );
    },
  },
  {
    name: "Portfolio",
    url: `${origins.portfolio}/health`,
    accept: jsonStatus("portfolio", ["ok"]),
  },
  {
    name: "File receiver route",
    url: `${origins.gateway}/f_public-health-check`,
    accept: async (response) =>
      response.status === 200 &&
      (response.headers.get("content-type") ?? "").includes("text/html"),
  },
];

const attempts = Math.max(
  1,
  Number.parseInt(process.env.HEALTH_ATTEMPTS ?? "1", 10),
);
const delayMs = Math.max(
  0,
  Number.parseInt(process.env.HEALTH_DELAY_MS ?? "15000", 10),
);

let results = [];

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  results = await Promise.all(checks.map(runCheck));
  console.table(results);
  if (results.every((result) => result.status === "PASS")) break;
  if (attempt < attempts) {
    console.log(
      `Service check attempt ${attempt}/${attempts} failed. Retrying in ${delayMs} ms.`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

const failures = results.filter((result) => result.status !== "PASS");
if (failures.length > 0) {
  process.exitCode = 1;
  console.error(`${failures.length} service check(s) failed.`);
} else {
  console.log("All services passed.");
}

async function runCheck(check) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(check.url, {
      headers: { "user-agent": "service-health-check/1.0" },
      redirect: "manual",
      signal: controller.signal,
    });
    const accepted = response.ok && (await check.accept(response.clone()));
    return {
      service: check.name,
      status: accepted ? "PASS" : `FAIL ${response.status}`,
      latency: `${Math.round(performance.now() - startedAt)} ms`,
      url: check.url,
    };
  } catch (error) {
    return {
      service: check.name,
      status: "FAIL",
      latency: `${Math.round(performance.now() - startedAt)} ms`,
      url: check.url,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function jsonStatus(service, statuses) {
  return async (response) => {
    const value = await response.json();
    return value.service === service && statuses.includes(value.status);
  };
}

async function anonymousSession(response) {
  const value = await response.json();
  return typeof value.authenticated === "boolean";
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}
