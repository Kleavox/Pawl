import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMPATIBILITY_DATE, workerName } from "@pawl/topology";

export function passD1({ local }) {
  let cachedConfigPath;

  function configPath() {
    if (local) return "workers/pass/wrangler.jsonc";
    if (cachedConfigPath) return cachedConfigPath;

    const prefix = requiredEnv("WORKER_PREFIX");
    const databaseId = requiredEnv("PASS_D1_ID");
    const dir = mkdtempSync(join(tmpdir(), "pw-pass-d1-"));
    cachedConfigPath = join(dir, "pass.json");
    writeFileSync(
      cachedConfigPath,
      JSON.stringify({
        name: workerName(prefix, "pass"),
        compatibility_date: COMPATIBILITY_DATE,
        d1_databases: [
          {
            binding: "DB",
            database_name: workerName(prefix, "pass"),
            database_id: databaseId,
          },
        ],
      }),
    );
    process.on("exit", () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        void 0;
      }
    });
    return cachedConfigPath;
  }

  function wrangler(sql, { capture }) {
    const wranglerArgs = ["exec", "wrangler", "d1", "execute", "DB"];
    wranglerArgs.push(local ? "--local" : "--remote");
    wranglerArgs.push("--config", configPath());
    wranglerArgs.push("--command", sql);
    if (capture) wranglerArgs.push("--json");

    const onWindows = process.platform === "win32";
    const finalArgs = onWindows ? wranglerArgs.map(quoteArg) : wranglerArgs;

    const result = spawnSync("pnpm", finalArgs, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: onWindows,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      if (capture && result.stderr) process.stderr.write(result.stderr);
      throw new Error(
        `wrangler exited with code ${result.status ?? "unknown"}.`,
      );
    }
    return result.stdout ?? "";
  }

  return {
    query(sql) {
      const stdout = wrangler(sql, { capture: true });
      try {
        const parsed = JSON.parse(stdout);
        const first = Array.isArray(parsed) ? parsed[0] : parsed;
        return first?.results ?? [];
      } catch {
        throw new Error(`Could not parse wrangler output:\n${stdout}`);
      }
    },
    run(sql) {
      wrangler(sql, { capture: false });
    },
  };
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing environment variable ${name} (required for --remote). ` +
        "Set WORKER_PREFIX and PASS_D1_ID, or use --local.",
    );
  }
  return value;
}

function quoteArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}
