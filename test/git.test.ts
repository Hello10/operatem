import assert from "node:assert/strict";
import { test } from "node:test";

import {
	attach,
	currentBranch,
	headSha,
	listSubmodules,
	recordedSha,
	trackedBranch,
	upstream,
} from "../src/git";
import { commitFile, createMetarepo, run } from "./fixture";

test("lists submodules with their .gitmodules name and checkout state", async () => {
	const repo = await createMetarepo();
	try {
		const subs = await listSubmodules(repo.root);
		assert.equal(subs.length, 1);
		assert.equal(subs[0].name, "submodules/sub");
		assert.equal(subs[0].path, "submodules/sub");
		assert.equal(subs[0].initialized, true);
		assert.equal(subs[0].sha, await headSha(repo.sub));
		assert.equal(await recordedSha(repo.root, "submodules/sub"), subs[0].sha);
		assert.equal(await trackedBranch(repo.root, subs[0]), "main");
	} finally {
		repo.cleanup();
	}
});

test("attach moves a fresh detached checkout onto the tracked branch", async () => {
	const repo = await createMetarepo();
	try {
		assert.equal(await currentBranch(repo.sub), "HEAD");
		assert.equal(await attach(repo.sub, "main"), "attached");
		assert.equal(await currentBranch(repo.sub), "main");
		assert.equal(await upstream(repo.sub), "origin/main");
		assert.equal(await attach(repo.sub, "main"), "already");
	} finally {
		repo.cleanup();
	}
});

test("attach fast-forwards a stale local branch instead of moving the checkout back", async () => {
	const repo = await createMetarepo();
	try {
		/* The clone's local main stays at the first commit while the detached
       checkout moves ahead of it. */
		const stale = await run(repo.sub, ["rev-parse", "main"]);
		const newer = await commitFile(repo.sub, "later.txt", "later\n");
		assert.notEqual(newer, stale);
		await run(repo.sub, ["push", "-q", "origin", "HEAD:main"]);
		await run(repo.sub, ["fetch", "-q"]);

		assert.equal(await attach(repo.sub, "main"), "attached");
		assert.equal(await currentBranch(repo.sub), "main");
		assert.equal(await headSha(repo.sub), newer);
	} finally {
		repo.cleanup();
	}
});

test("attach refuses a checkout that is not on the branch's history", async () => {
	const repo = await createMetarepo();
	try {
		await commitFile(repo.subElsewhere, "theirs.txt", "theirs\n");
		await run(repo.subElsewhere, ["push", "-q", "origin", "main"]);
		await commitFile(repo.sub, "mine.txt", "mine\n");
		await run(repo.sub, ["fetch", "-q"]);

		assert.equal(await attach(repo.sub, "main"), "diverged");
		assert.equal(await currentBranch(repo.sub), "HEAD");
		assert.equal(await attach(repo.sub, "nope"), "no-remote-branch");
	} finally {
		repo.cleanup();
	}
});
