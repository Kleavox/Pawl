import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { localWorkerOrigin } from "@pawl/topology";

import { WORKER_SOURCE } from "./repos.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const env = {
  ...process.env,
  VITE_ROOT_ORIGIN: localWorkerOrigin("gateway"),
  VITE_PASS_ORIGIN: localWorkerOrigin("pass"),
  VITE_LINK_ORIGIN: localWorkerOrigin("link"),
  PUBLIC_ROOT_ORIGIN: localWorkerOrigin("gateway"),
};

execSync(
  "pnpm exec turbo run build --filter=@pawl/gateway-worker^... --filter=@pawl/pass-worker^...",
  { cwd: repoRoot, env, stdio: "inherit" },
);

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

for (const [worker, source] of Object.entries(WORKER_SOURCE)) {
  if (worker === "gateway") continue;
  if (source === "local") {
    clearState(path.join(repoRoot, "workers", worker, ".wrangler", "state"));
    execSync(
      `pnpm exec wrangler d1 migrations apply DB --local --config workers/${worker}/wrangler.jsonc`,
      { cwd: repoRoot, env, stdio: "inherit" },
    );
    continue;
  }
  execSync("pnpm exec turbo run build", { cwd: source, env, stdio: "inherit" });
  clearState(path.join(source, "worker", ".wrangler", "state"));
  execSync(
    "pnpm exec wrangler d1 migrations apply DB --local --config worker/wrangler.jsonc",
    { cwd: source, env, stdio: "inherit" },
  );
}
