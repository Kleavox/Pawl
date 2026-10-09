#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  productionConfigs,
  productionSecrets,
  type DeployEnvironment,
  type DomainMode,
} from "./config.js";

const [command, ...args] = process.argv.slice(2);
const outputDirectory = resolve(option(args, "out") ?? ".wrangler/deploy");

try {
  if (command === "render") {
    const domains = (option(args, "domains") ?? "none") as DomainMode;
    if (!["none", "canonical"].includes(domains)) {
      throw new Error("--domains must be none or canonical.");
    }
    const configs = productionConfigs(
      process.env as unknown as DeployEnvironment,
      domains,
    );
    await mkdir(outputDirectory, { recursive: true });
    for (const [name, config] of Object.entries(configs)) {
      await writeFile(
        resolve(outputDirectory, `${name}.json`),
        `${JSON.stringify(config, null, 2)}\n`,
        "utf8",
      );
    }
    console.log(`Rendered ${Object.keys(configs).length} Worker configs.`);
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
      "Usage: deploy-config <render|secrets> [--domains none|canonical] [--out directory]",
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
