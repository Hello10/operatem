import { join } from "node:path";

import { execa } from "execa";

export async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execa("git", args, { cwd });
	return stdout.trim();
}

/* Like git(), but resolves to null instead of throwing. */
export async function tryGit(
	cwd: string,
	args: string[],
): Promise<string | null> {
	try {
		return await git(cwd, args);
	} catch {
		return null;
	}
}

export async function isDirty(
	cwd: string,
	{ ignoreSubmodules = false } = {},
): Promise<boolean> {
	return (await dirtyCount(cwd, { ignoreSubmodules })) > 0;
}

/* Number of changed paths (tracked or untracked) in the working tree. */
export async function dirtyCount(
	cwd: string,
	{ ignoreSubmodules = false } = {},
): Promise<number> {
	const args = ["status", "--porcelain"];
	if (ignoreSubmodules) args.push("--ignore-submodules=all");
	const out = await git(cwd, args);
	return out === "" ? 0 : out.split("\n").length;
}

/* True when the index holds staged changes. */
export async function hasStaged(cwd: string): Promise<boolean> {
	try {
		await execa("git", ["diff", "--cached", "--quiet"], { cwd });
		return false;
	} catch {
		return true;
	}
}

/* Branch name, or "HEAD" when detached. */
export async function currentBranch(cwd: string): Promise<string> {
	return git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export async function headSha(cwd: string): Promise<string> {
	return git(cwd, ["rev-parse", "HEAD"]);
}

export async function isAncestor(
	cwd: string,
	ancestor: string,
	descendant: string,
): Promise<boolean> {
	try {
		await execa("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
			cwd,
		});
		return true;
	} catch {
		return false;
	}
}

/* The upstream ref of the current branch, or null when there is none. */
export async function upstream(cwd: string): Promise<string | null> {
	return tryGit(cwd, [
		"rev-parse",
		"--abbrev-ref",
		"--symbolic-full-name",
		"@{upstream}",
	]);
}

export interface AheadBehind {
	ahead: number;
	behind: number;
}

/* Throws if the current branch has no upstream. */
export async function aheadBehind(cwd: string): Promise<AheadBehind> {
	const out = await git(cwd, [
		"rev-list",
		"--left-right",
		"--count",
		"HEAD...@{upstream}",
	]);
	const [ahead, behind] = out.split(/\s+/).map(Number);
	return { ahead, behind };
}

/* The branch origin/HEAD points at, falling back to asking the remote, then "main". */
export async function remoteDefaultBranch(cwd: string): Promise<string> {
	const local = await tryGit(cwd, [
		"symbolic-ref",
		"--short",
		"refs/remotes/origin/HEAD",
	]);
	if (local) return local.replace(/^origin\//, "");
	const remote = await tryGit(cwd, ["ls-remote", "--symref", "origin", "HEAD"]);
	const match = remote?.match(/^ref: refs\/heads\/(\S+)\s+HEAD/m);
	return match ? match[1] : "main";
}

export interface SubmoduleStatus {
	/* Name from .gitmodules; usually the last path segment. */
	name: string;
	path: string;
	/* Checked-out commit, or the recorded commit when not initialized. */
	sha: string;
	initialized: boolean;
}

export async function listSubmodules(cwd: string): Promise<SubmoduleStatus[]> {
	const out = await git(cwd, ["submodule", "status"]);
	if (!out) return [];
	const names = await submoduleNames(cwd);
	return out
		.split("\n")
		.map((line) => {
			/* The status char is a space for a clean checkout, and git() trims it
         off the first line, so it has to be optional here. */
			const match = line.match(/^([-+U ]?)([\da-f]{40})\s+(\S+)/);
			if (!match) return null;
			const [, statusChar, sha, path] = match;
			return {
				name: names.get(path) ?? path.split("/").pop()!,
				path,
				sha,
				initialized: statusChar !== "-",
			};
		})
		.filter((s): s is SubmoduleStatus => s !== null);
}

/* Map of submodule path to submodule name, from .gitmodules. */
async function submoduleNames(cwd: string): Promise<Map<string, string>> {
	const out = await tryGit(cwd, [
		"config",
		"-f",
		".gitmodules",
		"--get-regexp",
		"^submodule\\..*\\.path$",
	]);
	const names = new Map<string, string>();
	for (const line of out?.split("\n") ?? []) {
		const match = line.match(/^submodule\.(.+)\.path\s+(\S+)$/);
		if (match) names.set(match[2], match[1]);
	}
	return names;
}

/* The branch a submodule should track: `branch` in .gitmodules, else the remote default. */
export async function trackedBranch(
	root: string,
	sub: SubmoduleStatus,
): Promise<string> {
	const configured = await tryGit(root, [
		"config",
		"-f",
		".gitmodules",
		`submodule.${sub.name}.branch`,
	]);
	if (configured) return configured.replace(/^\.$/, "");
	return remoteDefaultBranch(join(root, sub.path));
}

/* Commit the metarepo records for a submodule in its HEAD commit. */
export async function recordedSha(
	root: string,
	path: string,
): Promise<string | null> {
	return tryGit(root, ["rev-parse", `HEAD:${path}`]);
}

export type AttachResult =
	| "attached"
	| "already"
	| "no-remote-branch"
	| "diverged";

/**
 * Move a detached checkout onto `branch` without losing anything.
 * The checkout must sit on the branch's history (at, ahead of, or behind
 * origin/<branch>). A local branch is fast-forwarded to HEAD when it is
 * behind, or checked out as-is when it is ahead.
 */
export async function attach(
	cwd: string,
	branch: string,
): Promise<AttachResult> {
	if ((await currentBranch(cwd)) !== "HEAD") return "already";
	const head = await headSha(cwd);
	const remote = `origin/${branch}`;
	if (!(await tryGit(cwd, ["rev-parse", "--verify", "--quiet", remote])))
		return "no-remote-branch";
	const onBranchHistory =
		(await isAncestor(cwd, head, remote)) ||
		(await isAncestor(cwd, remote, head));
	if (!onBranchHistory) return "diverged";

	const localRef = `refs/heads/${branch}`;
	const local = await tryGit(cwd, [
		"rev-parse",
		"--verify",
		"--quiet",
		localRef,
	]);
	if (local === null) {
		await git(cwd, ["checkout", "-b", branch]);
	} else if (await isAncestor(cwd, localRef, head)) {
		await git(cwd, ["checkout", "-B", branch]);
	} else if (await isAncestor(cwd, head, localRef)) {
		await git(cwd, ["checkout", branch]);
	} else {
		return "diverged";
	}
	await git(cwd, ["branch", `--set-upstream-to=${remote}`, branch]);
	return "attached";
}

export function short(sha: string): string {
	return sha.slice(0, 7);
}
