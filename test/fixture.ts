/* A throwaway metarepo with one submodule, each backed by a bare "origin". */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execa } from "execa";

/* Identity and settings for every git call in the test process, including
   the ones the code under test makes. */
Object.assign(process.env, {
	GIT_AUTHOR_NAME: "operatem test",
	GIT_AUTHOR_EMAIL: "test@example.com",
	GIT_COMMITTER_NAME: "operatem test",
	GIT_COMMITTER_EMAIL: "test@example.com",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_COUNT: "2",
	GIT_CONFIG_KEY_0: "protocol.file.allow",
	GIT_CONFIG_VALUE_0: "always",
	GIT_CONFIG_KEY_1: "init.defaultBranch",
	GIT_CONFIG_VALUE_1: "main",
});

export async function run(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execa("git", args, { cwd });
	return stdout.trim();
}

export async function commitFile(
	cwd: string,
	name: string,
	content: string,
	message = `add ${name}`,
): Promise<string> {
	writeFileSync(join(cwd, name), content);
	await run(cwd, ["add", name]);
	await run(cwd, ["commit", "-q", "-m", message]);
	return run(cwd, ["rev-parse", "HEAD"]);
}

export interface Metarepo {
	dir: string;
	/* A fresh recursive clone: the submodule starts out detached. */
	root: string;
	sub: string;
	subOrigin: string;
	metaOrigin: string;
	/* A second clone of the submodule, for simulating someone else's pushes. */
	subElsewhere: string;
	cleanup(): void;
}

export async function createMetarepo(): Promise<Metarepo> {
	const dir = mkdtempSync(join(tmpdir(), "operatem-git-"));
	const subOrigin = join(dir, "sub.git");
	const metaOrigin = join(dir, "meta.git");
	await run(dir, ["init", "-q", "--bare", subOrigin]);
	await run(dir, ["init", "-q", "--bare", metaOrigin]);

	const subSeed = join(dir, "sub-seed");
	await run(dir, ["clone", "-q", subOrigin, subSeed]);
	await commitFile(subSeed, "README.md", "sub\n");
	await run(subSeed, ["push", "-q", "-u", "origin", "main"]);

	const metaSeed = join(dir, "meta-seed");
	await run(dir, ["clone", "-q", metaOrigin, metaSeed]);
	await commitFile(metaSeed, "README.md", "meta\n");
	await run(metaSeed, ["submodule", "-q", "add", subOrigin, "submodules/sub"]);
	await run(metaSeed, ["commit", "-q", "-m", "add sub"]);
	await run(metaSeed, ["push", "-q", "-u", "origin", "main"]);

	const root = join(dir, "meta");
	await run(dir, ["clone", "-q", "--recurse-submodules", metaOrigin, root]);
	const subElsewhere = join(dir, "sub-elsewhere");
	await run(dir, ["clone", "-q", subOrigin, subElsewhere]);

	return {
		dir,
		root,
		sub: join(root, "submodules", "sub"),
		subOrigin,
		metaOrigin,
		subElsewhere,
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

/* Collects operation output so tests can assert on it. */
export function collector() {
	const lines: Array<{ name: string; state: string; detail?: string }> = [];
	return {
		lines,
		report: (line: { name: string; state: string; detail?: string }) => {
			lines.push({ name: line.name, state: line.state, detail: line.detail });
		},
		progress: () => {},
		state: (name: string) => lines.find((l) => l.name === name)?.state,
	};
}
