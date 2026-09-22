import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPackageManager, discoverWorkspaces } from "../src/workspace";

function fixture(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "operatem-test-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test("declared package manager wins over an old lockfile", () =>
  fixture((root) => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ packageManager: "pnpm@10.29.2" }),
    );
    writeFileSync(join(root, "package-lock.json"), "{}");
    assert.equal(detectPackageManager(root), "pnpm");
  }));
test("detects a lockfile when no manager is declared", () =>
  fixture((root) => {
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    assert.equal(detectPackageManager(root), "pnpm");
  }));
test("uses the requested metarepo config instead of the process cwd", () =>
  fixture((root) => {
    writeFileSync(
      join(root, "operatem.json"),
      JSON.stringify({ submodules: "repos", packages: "local" }),
    );
    const repo = join(root, "repos", "site");
    mkdirSync(repo, { recursive: true });
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({
        packageManager: "pnpm@10.29.2",
        scripts: { build: "vite build" },
      }),
    );
    const workspaces = discoverWorkspaces(root);
    assert.equal(workspaces.length, 1);
    assert.equal(workspaces[0].name, "site");
    assert.equal(workspaces[0].packageManager, "pnpm");
  }));
