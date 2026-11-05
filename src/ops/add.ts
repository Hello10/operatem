import { loadConfig } from "../config";
import { aheadBehind, git, isDirty, upstream } from "../git";
import { errorDetail, type Operation } from "./report";
import { sync } from "./sync";

export interface AddOptions {
	url: string;
	/* Defaults to the repo name from the URL. */
	name?: string;
}

/* git@github.com:Hello10/brand.git and https://github.com/Hello10/brand both give brand. */
export function repoNameFromUrl(url: string): string {
	const match = url.match(/([^/:]+?)(?:\.git)?$/);
	return match ? match[1] : "repo";
}

/**
 * Add a submodule to a current metarepo. A metarepo behind origin is synced
 * first, or the add is refused when it can't be, so the new submodule never
 * lands on stale history that then has to be reconciled.
 */
export function add(root: string, options: AddOptions): Operation {
	const repoName = options.name || repoNameFromUrl(options.url);
	return async (report, progress) => {
		progress("checking metarepo");
		if (await upstream(root)) {
			await git(root, ["fetch", "--quiet"]);
			const { behind } = await aheadBehind(root);
			if (behind > 0) {
				if (await isDirty(root, { ignoreSubmodules: true })) {
					report({
						name: repoName,
						state: "refused",
						tone: "bad",
						detail: `metarepo is ${behind} behind origin with uncommitted changes; commit, sync, then add`,
					});
					progress(null);
					return false;
				}
				if (!(await sync(root)(report, progress))) {
					report({
						name: repoName,
						state: "refused",
						tone: "bad",
						detail: "sync failed; fix the lines above, then add",
					});
					progress(null);
					return false;
				}
			}
		}

		progress(`adding ${repoName}`);
		const path = `${loadConfig(root).submodules}/${repoName}`;
		try {
			await git(root, ["submodule", "add", options.url, path]);
			report({ name: repoName, state: "added", tone: "good", detail: path });
			return true;
		} catch (error) {
			report({
				name: repoName,
				state: "error",
				tone: "bad",
				detail: errorDetail(error),
			});
			return false;
		} finally {
			progress(null);
		}
	};
}
