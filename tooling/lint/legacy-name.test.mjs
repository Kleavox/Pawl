import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { findLegacyNames } from "./legacy-name.mjs";

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "legacy-name-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

const OLD = ["kle", "avox"].join("");
const SHORT = ["k", "vx"].join("");

test("finds the old name in any case and its abbreviation", () => {
  const root = tree({
    "a.ts": `import x from "@${OLD}/core";`,
    "b.css": `.${SHORT}-row { color: red }`,
    "c.md": OLD.toUpperCase(),
  });
  const found = findLegacyNames(root, ["a.ts", "b.css", "c.md"]);
  assert.deepEqual(found.map((hit) => hit.file).sort(), [
    "a.ts",
    "b.css",
    "c.md",
  ]);
});

test("allows exactly the three frozen key-derivation labels", () => {
  const root = tree({
    "packages/crypto/src/index.ts": [
      `const HKDF_MK_INFO = new TextEncoder().encode("${OLD}/mk/v1");`,
      `const HKDF_AUTH_INFO = new TextEncoder().encode("${OLD}/auth/v1");`,
      `const HKDF_SEAL_INFO = new TextEncoder().encode("${OLD}/seal/v1");`,
    ].join("\n"),
  });
  assert.deepEqual(findLegacyNames(root, ["packages/crypto/src/index.ts"]), []);
});

test("does not allow the frozen label anywhere else", () => {
  const root = tree({
    "other.ts": `const HKDF_MK_INFO = new TextEncoder().encode("${OLD}/mk/v1");`,
  });
  assert.equal(findLegacyNames(root, ["other.ts"]).length, 1);
});

test("does not allow a fourth label in the crypto file", () => {
  const root = tree({
    "packages/crypto/src/index.ts": `const D = "${OLD}/other/v1";`,
  });
  assert.equal(
    findLegacyNames(root, ["packages/crypto/src/index.ts"]).length,
    1,
  );
});

test("ignores the abbreviation inside a longer token such as an integrity hash", () => {
  const root = tree({
    "pnpm-lock.yaml": `resolution: {integrity: sha512-abcQQ${SHORT.slice(0, 2)}X${SHORT.slice(2).toUpperCase()}SLdef==}`,
  });
  assert.deepEqual(findLegacyNames(root, ["pnpm-lock.yaml"]), []);
});

test("finds the old name split by markup", () => {
  const root = tree({
    "page.html": `<span>${OLD.slice(0, 5)}<b>${OLD.slice(5)}</b></span>`,
  });
  assert.equal(findLegacyNames(root, ["page.html"]).length, 1);
});
