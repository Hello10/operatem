import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { currentBranch, headSha, recordedSha } from "../src/git";
import { add, repoNameFromUrl } from "../src/ops/add";
import { commit } from "../src/ops/commit";
import { push } from "../src/ops/push";
import { status, rowHasIssue } from "../src/ops/status";
import { sync } from "../src/ops/sync";
import {
	collector,
	commitFile,
	createMetarepo,
	run,
	type Metarepo,
} from "./fixture";

test("sync attaches a fresh clone's submodule, fast-forwards it, and bumps the pointer", async () => {
	const repo = await createMetarepo();
	try {
		const first = collector();
		assert.equal(await sync(repo.root)(first.report, first.progress), true);
		assert.equal(first.state("metarepo"), "up-to-date");
		assert.equal(first.state("submodules/sub"), "up-to-date");
		assert.equal(await currentBranch(repo.sub), "main");

		/* Someone pushes to the submodule; sync brings the checkout forward and
       commits the pointer so the metarepo is not left dirty. */
		const theirs = await commitFile(
			repo.subElsewhere,
			"theirs.txt",
			"theirs\n",
		);
		await run(repo.subElsewhere, ["push", "-q", "origin", "main"]);
		const second = collector();
		assert.equal(await sync(repo.root)(second.report, second.progress), true);
		assert.equal(second.state("submodules/sub"), "updated");
		assert.equal(await headSha(repo.sub), theirs);
		assert.ok(
			second.lines.some((l) => l.name === "metarepo" && l.state === "bumped"),
		);
		assert.equal(await recordedSha(repo.root, "submodules/sub"), theirs);
		assert.equal(
			await run(repo.root, ["log", "-1", "--format=%s"]),
			"bump submodules/sub: sync to origin",
		);

		const rows = await status(repo.root, { fetch: false });
		const sub = rows.find((r) => r.name === "submodules/sub")!;
		assert.equal(sub.pointer, null);
		assert.equal(rowHasIssue(sub), false);
	} finally {
		repo.cleanup();
	}
});

test("sync --no-bump leaves the stale pointer for the user", async () => {
	const repo = await createMetarepo();
	try {
		const prep = collector();
		await sync(repo.root)(prep.report, prep.progress);
		await commitFile(repo.subElsewhere, "theirs.txt", "theirs\n");
		await run(repo.subElsewhere, ["push", "-q", "origin", "main"]);

		const out = collector();
		const op = sync(repo.root, { bump: false });
		assert.equal(await op(out.report, out.progress), true);
		assert.equal(out.state("submodules/sub"), "updated");
		assert.ok(!out.lines.some((l) => l.state === "bumped"));

		const rows = await status(repo.root, { fetch: false });
		const sub = rows.find((r) => r.name === "submodules/sub")!;
		assert.notEqual(sub.pointer, null);
		assert.equal(rowHasIssue(sub), true);
	} finally {
		repo.cleanup();
	}
});

test("sync does not bump a submodule that is ahead of origin", async () => {
	const repo = await createMetarepo();
	try {
		const prep = collector();
		await sync(repo.root)(prep.report, prep.progress);
		const recorded = await recordedSha(repo.root, "submodules/sub");
		/* Local, unpushed submodule work: bumping would record a commit origin
       can't reach, so sync must leave the pointer alone. */
		await commitFile(repo.sub, "mine.txt", "mine\n");

		const out = collector();
		assert.equal(await sync(repo.root)(out.report, out.progress), true);
		assert.ok(!out.lines.some((l) => l.state === "bumped"));
		assert.equal(await recordedSha(repo.root, "submodules/sub"), recorded);
	} finally {
		repo.cleanup();
	}
});

test("sync's pointer bump leaves unrelated metarepo changes behind", async () => {
	const repo = await createMetarepo();
	try {
		const prep = collector();
		await sync(repo.root)(prep.report, prep.progress);
		await commitFile(repo.subElsewhere, "theirs.txt", "theirs\n");
		await run(repo.subElsewhere, ["push", "-q", "origin", "main"]);
		writeFileSync(join(repo.root, "notes.txt"), "work in progress\n");
		await run(repo.root, ["add", "notes.txt"]);

		const out = collector();
		assert.equal(await sync(repo.root)(out.report, out.progress), true);
		assert.ok(
			out.lines.some((l) => l.name === "metarepo" && l.state === "bumped"),
		);
		assert.doesNotMatch(
			await run(repo.root, ["show", "--stat", "--format=", "HEAD"]),
			/notes\.txt/,
		);
		assert.match(await run(repo.root, ["status", "--porcelain"]), /notes\.txt/);
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
		assert.equal(
			await run(repo.sub, ["log", "-1", "--format=%s"]),
			"edit readme",
		);
		assert.equal(
			await run(repo.root, ["log", "-1", "--format=%s"]),
			"bump submodules/sub: edit readme",
		);
		/* Commit takes everything status calls dirty — untracked included — so a
       commit can never leave a partial state behind. */
		assert.equal(await run(repo.sub, ["status", "--porcelain"]), "");
		assert.match(
			await run(repo.sub, ["show", "--stat", "--format=", "HEAD"]),
			/new\.txt/,
		);

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
		assert.equal(sub.dirty, 0);
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
		assert.equal(
			await run(repo.sub, ["log", "--oneline"]).then(
				(l) => l.split("\n").length,
			),
			1,
		);
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

/* A second clone of the metarepo, for simulating someone else's pushes. */
async function metaElsewhere(repo: Metarepo): Promise<string> {
	const path = join(repo.dir, "meta-elsewhere");
	await run(repo.dir, ["clone", "-q", repo.metaOrigin, path]);
	return path;
}

test("sync rebases local metarepo commits onto origin", async () => {
	const repo = await createMetarepo();
	try {
		const prep = collector();
		await sync(repo.root)(prep.report, prep.progress);
		const elsewhere = await metaElsewhere(repo);
		await commitFile(elsewhere, "theirs.txt", "theirs\n");
		await run(elsewhere, ["push", "-q", "origin", "main"]);
		await commitFile(repo.root, "mine.txt", "mine\n");

		const out = collector();
		assert.equal(await sync(repo.root)(out.report, out.progress), true);
		assert.equal(out.state("metarepo"), "rebased");
		assert.equal(
			await run(repo.root, [
				"rev-list",
				"--left-right",
				"--count",
				"HEAD...@{upstream}",
			]),
			"1\t0",
		);

		const pushed = collector();
		assert.equal(await push(repo.root)(pushed.report, pushed.progress), true);
		assert.equal(pushed.state("metarepo"), "pushed");
	} finally {
		repo.cleanup();
	}
});

test("sync aborts a conflicting rebase and leaves everything as it was", async () => {
	const repo = await createMetarepo();
	try {
		const prep = collector();
		await sync(repo.root)(prep.report, prep.progress);
		const elsewhere = await metaElsewhere(repo);
		await commitFile(elsewhere, "same.txt", "theirs\n");
		await run(elsewhere, ["push", "-q", "origin", "main"]);
		const mine = await commitFile(repo.root, "same.txt", "mine\n");
		const subTip = await commitFile(
			repo.subElsewhere,
			"theirs.txt",
			"theirs\n",
		);
		await run(repo.subElsewhere, ["push", "-q", "origin", "main"]);

		const out = collector();
		assert.equal(await sync(repo.root)(out.report, out.progress), false);
		assert.equal(out.state("metarepo"), "conflict");
		assert.equal(await headSha(repo.root), mine);
		assert.equal(await run(repo.root, ["status", "--porcelain"]), "");
		assert.notEqual(await headSha(repo.sub), subTip);
	} finally {
		repo.cleanup();
	}
});

test("sync stops when the metarepo is dirty and behind", async () => {
	const repo = await createMetarepo();
	try {
		const prep = collector();
		await sync(repo.root)(prep.report, prep.progress);
		const elsewhere = await metaElsewhere(repo);
		await commitFile(elsewhere, "theirs.txt", "theirs\n");
		await run(elsewhere, ["push", "-q", "origin", "main"]);
		const subTip = await commitFile(
			repo.subElsewhere,
			"theirs.txt",
			"theirs\n",
		);
		await run(repo.subElsewhere, ["push", "-q", "origin", "main"]);
		writeFileSync(join(repo.root, "README.md"), "meta, edited\n");

		const out = collector();
		assert.equal(await sync(repo.root)(out.report, out.progress), false);
		assert.equal(out.state("metarepo"), "skipped-dirty");
		assert.notEqual(await headSha(repo.sub), subTip);
	} finally {
		repo.cleanup();
	}
});

test("add syncs a clean metarepo that is behind, then adds", async () => {
	const repo = await createMetarepo();
	try {
		const prep = collector();
		await sync(repo.root)(prep.report, prep.progress);
		const elsewhere = await metaElsewhere(repo);
		await commitFile(elsewhere, "theirs.txt", "theirs\n");
		await run(elsewhere, ["push", "-q", "origin", "main"]);

		const out = collector();
		const op = add(repo.root, { url: repo.subOrigin, name: "second" });
		assert.equal(await op(out.report, out.progress), true);
		assert.equal(out.state("metarepo"), "updated");
		assert.equal(out.state("second"), "added");
		assert.equal(
			await run(repo.root, [
				"rev-list",
				"--left-right",
				"--count",
				"HEAD...@{upstream}",
			]),
			"0\t0",
		);
		assert.match(
			await run(repo.root, ["status", "--porcelain"]),
			/submodules\/second/,
		);
	} finally {
		repo.cleanup();
	}
});

test("add refuses a metarepo that is dirty and behind", async () => {
	const repo = await createMetarepo();
	try {
		const prep = collector();
		await sync(repo.root)(prep.report, prep.progress);
		const elsewhere = await metaElsewhere(repo);
		await commitFile(elsewhere, "theirs.txt", "theirs\n");
		await run(elsewhere, ["push", "-q", "origin", "main"]);
		writeFileSync(join(repo.root, "README.md"), "meta, edited\n");

		const out = collector();
		const op = add(repo.root, { url: repo.subOrigin, name: "second" });
		assert.equal(await op(out.report, out.progress), false);
		assert.equal(out.state("second"), "refused");
		assert.doesNotMatch(
			await run(repo.root, ["status", "--porcelain"]),
			/second/,
		);
	} finally {
		repo.cleanup();
	}
});

test("repoNameFromUrl handles SSH and HTTPS URLs", () => {
	assert.equal(repoNameFromUrl("git@github.com:Hello10/brand.git"), "brand");
	assert.equal(repoNameFromUrl("https://github.com/Hello10/brand"), "brand");
});
