import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

const topology = readFileSync(
  resolve(root, "packages/topology/src/index.ts"),
  "utf8",
);
const block = topology.match(
  /export const LOCAL_WORKER_PORTS = \{([^}]*)\} as const;/,
);

if (!block) {
  process.stderr.write("LOCAL_WORKER_PORTS not found in packages/topology\n");
  process.exit(1);
}

const declared = new Map();
for (const line of block[1].matchAll(/(\w+):\s*(\d+)/g)) {
  declared.set(line[1], Number(line[2]));
}

const drift = [];
const elsewhere = [];
for (const [application, port] of declared) {
  const path = resolve(root, "workers", application, "wrangler.jsonc");
  let config = "";
  try {
    config = readFileSync(path, "utf8");
  } catch {
    elsewhere.push(application);
    continue;
  }
  const found = config.match(/"dev":\s*\{[^}]*"port":\s*(\d+)/);
  if (!found) {
    drift.push(
      `${application}: no "dev": { "port": ... } in its wrangler.jsonc, wanted ${port}`,
    );
    continue;
  }
  if (Number(found[1]) !== port) {
    drift.push(
      `${application}: wrangler.jsonc says ${found[1]}, topology says ${port}`,
    );
  }
}

if (drift.length > 0) {
  process.stderr.write(
    "Worker dev ports disagree with packages/topology:\n" +
      drift.map((line) => "  " + line).join("\n") +
      "\n\nWithout an explicit port every Worker takes Wrangler's default and\n" +
      "they all bind 8787, so only one of them is reachable under pnpm dev.\n",
  );
  process.exit(1);
}

process.stdout.write(
  "Worker dev ports: " + declared.size + " pinned to topology\n",
);
