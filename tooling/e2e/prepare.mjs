import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const manifestFile = path.join(here, "fixture", "estate.json");

const env = {
  ...process.env,
  ESTATE_MANIFEST: readFileSync(manifestFile, "utf8"),
  VITE_ROOT_ORIGIN: "http://127.0.0.1:8786",
  VITE_PASS_ORIGIN: "http://127.0.0.1:8787",
  PUBLIC_ROOT_ORIGIN: "http://127.0.0.1:8786",
};

function clearState(state) {
  try {
    rmSync(state, { recursive: true, force: true });
  } catch (cause) {
    throw new Error(
      `cannot remove ${state}. An orphaned workerd process is usually still ` +
        `holding it; kill every workerd, which can take several passes on ` +
        `Windows, then run this again. Underlying cause: ${String(cause)}`,
    );
  }
}

execSync("pnpm exec turbo run build", { cwd: repoRoot, env, stdio: "inherit" });
execSync(
  `node tooling/deploy/dist/cli.js render-local --manifest "${manifestFile}" --out .wrangler/local`,
  { cwd: repoRoot, env, stdio: "inherit" },
);
clearState(path.join(repoRoot, "workers", "pass", ".wrangler", "state"));
execSync(
  "pnpm exec wrangler d1 migrations apply DB --local --config workers/pass/wrangler.jsonc",
  { cwd: repoRoot, env, stdio: "inherit" },
);
execSync(
  `pnpm exec wrangler d1 execute DB --local --config workers/pass/wrangler.jsonc --command "INSERT INTO oauth_clients (id, name, redirect_uris, allowed_scopes, confidential, first_party, sector, approved_at) VALUES ('fixture-notes', 'Notes', '[\\"http://localhost:8790/callback\\",\\"http://127.0.0.1:8790/callback\\"]', '[\\"openid\\",\\"email\\",\\"profile\\"]', 0, 1, 'localhost', datetime('now'))"`,
  { cwd: repoRoot, env, stdio: "inherit" },
);
execSync(
  `pnpm exec wrangler d1 execute DB --local --config workers/pass/wrangler.jsonc --command "INSERT INTO oauth_clients (id, name, redirect_uris, allowed_scopes, confidential, first_party, sector, approved_at) VALUES ('fixture-docs', 'Docs', '[\\"http://localhost:8791/callback\\",\\"http://127.0.0.1:8791/callback\\"]', '[\\"openid\\",\\"email\\",\\"profile\\"]', 0, 0, 'docs.fixture.test', datetime('now'))"`,
  { cwd: repoRoot, env, stdio: "inherit" },
);
const gatewaySecretHash = createHash("sha256")
  .update("local-gateway-secret")
  .digest("base64url");
execSync(
  `pnpm exec wrangler d1 execute DB --local --config workers/pass/wrangler.jsonc --command "INSERT INTO oauth_clients (id, name, redirect_uris, allowed_scopes, confidential, first_party, secret_hash, sector, approved_at) VALUES ('gateway', 'Cabinet', '[\\"http://localhost:8786/auth/callback\\",\\"http://127.0.0.1:8786/auth/callback\\"]', '[\\"openid\\",\\"email\\",\\"profile\\"]', 1, 1, '${gatewaySecretHash}', 'localhost', datetime('now'))"`,
  { cwd: repoRoot, env, stdio: "inherit" },
);
