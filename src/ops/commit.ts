import { join } from "node:path";
import {
  currentBranch,
  git,
  hasStaged,
  headSha,
  isDirty,
  listSubmodules,
  short,
} from "../git";
import { errorDetail, matchesWorkspace, type Operation } from "./report";

export interface CommitOptions {
  message: string;
  /* Limit submodule commits to one workspace. The metarepo is always considered. */
  workspace?: string;
}

/* Stage and commit one checkout — everything status calls dirty, untracked
   included, so a commit can never leave a partial state behind. .gitignore is
   the mechanism for keeping files out. Resolves to the new sha, or null when
   nothing was staged. */
async function commitRepo(
  cwd: string,
  message: string,
): Promise<string | null> {
  await git(cwd, ["add", "-A"]);
  if (!(await hasStaged(cwd))) return null;
  await git(cwd, ["commit", "--quiet", "-m", message]);
  return headSha(cwd);
}

/**
 * Commit dirty submodules with `message`, then commit the metarepo so it
 * records the new submodule commits. The metarepo message names the bumped
 * submodules; when none were committed, it uses `message` as-is.
 */
export function commit(root: string, options: CommitOptions): Operation {
  const { message, workspace } = options;
  return async (report, progress) => {
    let ok = true;
    const bumped: string[] = [];
    for (const sub of await listSubmodules(root)) {
      if (!sub.initialized || !matchesWorkspace(workspace, sub)) continue;
      progress(`committing ${sub.name}`);
      const cwd = join(root, sub.path);
      try {
        if (!(await isDirty(cwd))) {
          report({ name: sub.name, state: "clean", tone: "muted" });
          continue;
        }
        if ((await currentBranch(cwd)) === "HEAD") {
          ok = false;
          report({
            name: sub.name,
            state: "detached",
            tone: "bad",
            detail: "run sync to attach a branch before committing",
          });
          continue;
        }
        const sha = await commitRepo(cwd, message);
        if (sha === null) {
          report({ name: sub.name, state: "clean", tone: "muted" });
          continue;
        }
        bumped.push(sub.name);
        report({ name: sub.name, state: "committed", tone: "good", detail: short(sha) });
      } catch (error) {
        ok = false;
        report({ name: sub.name, state: "error", tone: "bad", detail: errorDetail(error) });
      }
    }

    progress("committing metarepo");
    try {
      const rootMessage = bumped.length
        ? `bump ${bumped.join(", ")}: ${message}`
        : message;
      const sha = await commitRepo(root, rootMessage);
      report(
        sha === null
          ? { name: "metarepo", state: "clean", tone: "muted" }
          : { name: "metarepo", state: "committed", tone: "good", detail: `${short(sha)} ${rootMessage}` },
      );
    } catch (error) {
      ok = false;
      report({ name: "metarepo", state: "error", tone: "bad", detail: errorDetail(error) });
    }
    progress(null);
    return ok;
  };
}
