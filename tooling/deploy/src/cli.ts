#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { initRegistryFromDisk } from "@pawl/registry/node";

import {
  localConfigs,
  productionConfigs,
  productionSecrets,
  type DeployEnvironment,
  type DomainMode,
} from "./config.js";

const [command, ...args] = process.argv.slice(2);
const outputDirectory = resolve(option(args, "out") ?? ".wrangler/deploy");

async function writeConfigs(configs: Record<string, unknown>): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  for (const [name, config] of Object.entries(configs)) {
    await writeFile(
      resolve(outputDirectory, `${name}.json`),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
  }
}

async function throwawaySigningKey(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return Buffer.from(pkcs8).toString("base64");
}

try {
  initRegistryFromDisk();
  if (command === "render") {
    const domains = (option(args, "domains") ?? "none") as DomainMode;
    if (!["none", "canonical"].includes(domains)) {
      throw new Error("--domains must be none or canonical.");
    }
    const manifest = process.env.ESTATE_MANIFEST?.trim();
    if (!manifest) {
      throw new Error(
        "ESTATE_MANIFEST is empty. Set it in GitHub (Settings → Secrets and variables → Actions → Variables) to the deployment's estate.json.",
      );
    }
    const configs = productionConfigs(
      process.env as unknown as DeployEnvironment,
      domains,
      manifest,
    );
    await writeConfigs(configs);
    console.log(`Rendered ${Object.keys(configs).length} Worker configs.`);
  } else if (command === "render-local") {
    const file = option(args, "manifest");
    if (!file) throw new Error("render-local needs --manifest <file>.");
    const configs = localConfigs(
      await readFile(resolve(file), "utf8"),
      await throwawaySigningKey(),
    );
    await writeConfigs(configs);
    console.log(
      `Rendered ${Object.keys(configs).length} local Worker configs.`,
    );
  } else if (command === "secrets") {
    const secrets = productionSecrets(process.env);
    await mkdir(outputDirectory, { recursive: true });
    for (const [name, values] of Object.entries(secrets)) {
      await writeFile(
        resolve(outputDirectory, `${name}.secrets.json`),
        `${JSON.stringify(values)}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
    }
    console.log("Rendered production secret files.");
  } else {
    throw new Error(
      "Usage: deploy-config <render|render-local|secrets> [--domains none|canonical] [--manifest file] [--out directory]",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function option(values: string[], name: string): string | undefined {
  const index = values.indexOf(`--${name}`);
  return index === -1 ? undefined : values[index + 1];
}
