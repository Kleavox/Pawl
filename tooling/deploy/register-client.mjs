import { randomBytes } from "node:crypto";

import { passD1 } from "./d1.mjs";
import { prepareClient } from "./dist/client.js";

const args = process.argv.slice(2);
const USAGE =
  "Usage: register-client.mjs --id <slug> --name <name> --redirect-uri <uri> " +
  "[--redirect-uri <uri> ...] [--scope openid --scope email ...] " +
  "[--first-party] [--public] [--sector <host>] [--local]";

try {
  const id = optionValue("--id");
  const name = optionValue("--name");
  if (!id || !name) throw new Error(`Missing --id or --name.\n${USAGE}`);

  const confidential = !args.includes("--public");
  const secret = confidential ? randomBytes(32).toString("base64url") : null;
  const scopes = optionValues("--scope");
  const sector = optionValue("--sector");
  const { sql } = prepareClient(
    {
      id,
      name,
      redirectUris: optionValues("--redirect-uri"),
      firstParty: args.includes("--first-party"),
      confidential,
      scopes: scopes.length > 0 ? scopes : ["openid", "email", "profile"],
      ...(sector ? { sector } : {}),
    },
    secret,
  );

  passD1({ local: args.includes("--local") }).run(sql);
  console.log(`\nRegistered ${id}.`);
  if (secret) {
    console.log(
      "\nIts client secret is below. It is shown once and Pawl keeps only its hash:" +
        `\n\n  ${secret}\n\nPut it where the client reads it, then clear this terminal.`,
    );
  }
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}

function optionValue(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function optionValues(name) {
  return args.flatMap((value, index) =>
    value === name && args[index + 1] !== undefined ? [args[index + 1]] : [],
  );
}
