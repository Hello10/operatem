import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { currentBranch, headSha, recordedSha } from "../src/git";
import { sync } from "../src/ops/sync";
import { commit } from "../src/ops/commit";
import { push } from "../src/ops/push";
import { status, rowHasIssue } from "../src/ops/status";
import { collector, commitFile, createMetarepo, run } from "./fixture";

test("sync attaches a fresh clone's submodule and fast-forwards it", async () => {
  const repo = await createMetarepo();
  try {
    const first = collector();
    assert.equal(await sync(repo.root)(first.report, first.progress), true);
    assert.equal(first.state("metarepo"), "up-to-date");
    assert.equal(first.state("submodules/sub"), "up-to-date");
    assert.equal(await currentBranch(repo.sub), "main");

    /* Someone pushes to the submodule; sync should bring it forward. */
    const theirs = await commitFile(repo.subElsewhere, "theirs.txt", "theirs\n");
    await run(repo.subElsewhere, ["push", "-q", "origin", "main"]);
    const second = collector();
    assert.equal(await sync(repo.root)(second.report, second.progress), true);
    assert.equal(second.state("submodules/sub"), "updated");
    assert.equal(await headSha(repo.sub), theirs);

    /* The metarepo now records an older commit than the checkout. */
    const rows = await status(repo.root, { fetch: false });
    const sub = rows.find((r) => r.name === "submodules/sub")!;
    assert.notEqual(sub.pointer, null);
    assert.equal(rowHasIssue(sub), true);
  } finally {
    repo.cleanup();
  }
});

test("sync leaves a diverged submodule detached and reports failure", async () => {
  const repo = await createMetarepo();
  try {
    await commitFile(repo.subElsewhere, "theirs.txt", "theirs\n");
    await run(repo.subElsewhere, ["push", "-q", "origin", "main"]);
    await commitFile(repo.sub, "mine.txt", "mine\n");

    const out = collector();
    assert.equal(await sync(repo.root)(out.report, out.progress), false);
    assert.equal(out.state("submodules/sub"), "detached");
    assert.equal(await currentBranch(repo.sub), "HEAD");
  } finally {
    repo.cleanup();
  }
});

test("commit then push records and publishes submodule work", async () => {
  const repo = await createMetarepo();
  try {
    const prep = collector();
    await sync(repo.root)(prep.report, prep.progress);
    writeFileSync(join(repo.sub, "README.md"), "sub, edited\n");
    writeFileSync(join(repo.sub, "new.txt"), "untracked\n");

    const committed = collector();
    const op = commit(repo.root, { message: "edit readme" });
    assert.equal(await op(committed.report, committed.progress), true);
    assert.equal(committed.state("submodules/sub"), "committed");
    assert.equal(committed.state("metarepo"), "committed");
    const subHead = await headSha(repo.sub);
    assert.equal(await recordedSha(repo.root, "submodules/sub"), subHead);
    assert.equal(await run(repo.sub, ["log", "-1", "--format=%s"]), "edit readme");
    assert.equal(
      await run(repo.root, ["log", "-1", "--format=%s"]),
      "bump submodules/sub: edit readme",
    );
    /* Untracked files stay untracked without --all. */
    assert.match(await run(repo.sub, ["status", "--porcelain"]), /\?\? new\.txt/);

    const pushed = collector();
    assert.equal(await push(repo.root)(pushed.report, pushed.progress), true);
    assert.equal(pushed.state("submodules/sub"), "pushed");
    assert.equal(pushed.state("metarepo"), "pushed");
    assert.equal(await run(repo.subOrigin, ["rev-parse", "main"]), subHead);
    assert.equal(
      await run(repo.metaOrigin, ["rev-parse", "main"]),
      await headSha(repo.root),
    );

    const rows = await status(repo.root, { fetch: false });
    const sub = rows.find((r) => r.name === "submodules/sub")!;
    assert.equal(sub.dirty, 1);
    assert.equal(sub.ahead, 0);
    assert.equal(sub.pointer, null);
  } finally {
    repo.cleanup();
  }
});

test("commit refuses a dirty detached submodule", async () => {
  const repo = await createMetarepo();
  try {
    writeFileSync(join(repo.sub, "README.md"), "edited while detached\n");
    const out = collector();
    const op = commit(repo.root, { message: "should not land" });
    assert.equal(await op(out.report, out.progress), false);
    assert.equal(out.state("submodules/sub"), "detached");
    assert.equal(await run(repo.sub, ["log", "--oneline"]).then((l) => l.split("\n").length), 1);
  } finally {
    repo.cleanup();
  }
});

test("push refuses when the metarepo is behind origin", async () => {
  const repo = await createMetarepo();
  try {
    const prep = collector();
    await sync(repo.root)(prep.report, prep.progress);
    const elsewhere = join(repo.dir, "meta-elsewhere");
    await run(repo.dir, ["clone", "-q", repo.metaOrigin, elsewhere]);
    await commitFile(elsewhere, "note.txt", "from elsewhere\n");
    await run(elsewhere, ["push", "-q", "origin", "main"]);
    await commitFile(repo.root, "local.txt", "local\n");

    const out = collector();
    assert.equal(await push(repo.root)(out.report, out.progress), false);
    assert.equal(out.state("metarepo"), "diverged");
  } finally {
    repo.cleanup();
  }
});
