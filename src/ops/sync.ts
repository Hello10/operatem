import { join } from "node:path";
import {
  attach,
  currentBranch,
  git,
  headSha,
  isDirty,
  listSubmodules,
  trackedBranch,
} from "../git";
import { errorDetail, type Operation } from "./report";

type SyncState = "updated" | "up-to-date" | "skipped-dirty" | "diverged";

/* Fetch and fast-forward one checkout. */
async function syncRepo(
  cwd: string,
  { ignoreSubmodules = false, fetched = false } = {},
): Promise<SyncState> {
  if (!fetched) await git(cwd, ["fetch", "--quiet"]);
  if (await isDirty(cwd, { ignoreSubmodules })) return "skipped-dirty";
  const before = await headSha(cwd);
  try {
    await git(cwd, ["pull", "--quiet", "--ff-only"]);
  } catch {
    return "diverged";
  }
  return (await headSha(cwd)) === before ? "up-to-date" : "updated";
}

const TONE: Record<SyncState, "good" | "muted" | "warn" | "bad"> = {
  updated: "good",
  "up-to-date": "muted",
  "skipped-dirty": "warn",
  diverged: "bad",
};

/**
 * Fast-forward the metarepo, then every submodule on its tracked branch.
 * Detached submodules are attached to that branch first when their checkout
 * sits on its history, which is the state `git submodule update` leaves them in.
 */
export function sync(root: string): Operation {
  return async (report, progress) => {
    let ok = true;
    progress("syncing metarepo");
    try {
      const state = await syncRepo(root, { ignoreSubmodules: true });
      if (state === "diverged") ok = false;
      report({ name: "metarepo", state, tone: TONE[state] });
    } catch (error) {
      ok = false;
      report({ name: "metarepo", state: "error", tone: "bad", detail: errorDetail(error) });
    }

    for (const sub of await listSubmodules(root)) {
      progress(`syncing ${sub.name}`);
      const cwd = join(root, sub.path);
      try {
        if (!sub.initialized) {
          await git(root, ["submodule", "update", "--init", "--", sub.path]);
        }
        await git(cwd, ["fetch", "--quiet"]);
        const branch = await trackedBranch(root, sub);
        let attached = false;
        if ((await currentBranch(cwd)) === "HEAD") {
          const result = await attach(cwd, branch);
          if (result === "attached") attached = true;
          if (result === "no-remote-branch" || result === "diverged") {
            ok = false;
            report({
              name: sub.name,
              state: "detached",
              tone: "bad",
              detail:
                result === "no-remote-branch"
                  ? `origin has no branch "${branch}"`
                  : `checkout is not on origin/${branch}; check out a branch by hand`,
            });
            continue;
          }
        }
        const state = await syncRepo(cwd, { fetched: true });
        if (state === "diverged") ok = false;
        report({
          name: sub.name,
          state: sub.initialized ? state : "initialized",
          tone: TONE[state],
          detail: attached ? `attached to ${branch}` : undefined,
        });
      } catch (error) {
        ok = false;
        report({ name: sub.name, state: "error", tone: "bad", detail: errorDetail(error) });
      }
    }
    progress(null);
    return ok;
  };
}
