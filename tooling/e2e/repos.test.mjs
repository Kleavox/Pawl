import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

import { SIBLING_REPOS, WORKER_SOURCE } from "./repos.mjs";

test("every sibling repo exists on disk", () => {
  for (const [name, directory] of Object.entries(SIBLING_REPOS)) {
    assert.ok(
      existsSync(directory),
      `SIBLING_REPOS.${name} points at ${directory}, which does not exist`,
    );
  }
});

test("every worker is local or a sibling that exists", () => {
  for (const [worker, source] of Object.entries(WORKER_SOURCE)) {
    if (source === "local") continue;
    assert.ok(
      existsSync(source),
      `WORKER_SOURCE.${worker} points at ${source}, which does not exist`,
    );
  }
});
