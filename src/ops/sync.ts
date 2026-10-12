import { join } from "node:path";
import {
  attach,
  currentBranch,
  git,
  headSha,
  isDirty,
  listSubmodules,
  recordedSha,
  short,
  trackedBranch,
  tryGit,
} from "../git";
import { errorDetail, type Operation } from "./report";

export interface SyncOptions {
  /* Commit pointer bumps for submodules sitting on their origin branch tip. */
  bump?: boolean;
}

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

/* Commit stale pointers for submodules whose checkout is exactly origin's
   branch tip. That tip is already pushed, so the metarepo can never end up
   pointing at a commit its remote can't reach. Committing by pathspec leaves
   anything else dirty or staged in the metarepo untouched. */
async function bumpPointers(
  root: string,
): Promise<{ names: string[]; sha: string; message: string } | null> {
  const stale: Array<{ name: string; path: string }> = [];
  for (const sub of await listSubmodules(root)) {
    if (!sub.initialized) continue;
    const cwd = join(root, sub.path);
    const branch = await trackedBranch(root, sub);
    const remote = await tryGit(cwd, ["rev-parse", `origin/${branch}`]);
    if (remote === null) continue;
    const head = await headSha(cwd);
    if (head !== remote) continue;
    const recorded = await recordedSha(root, sub.path);
    if (recorded === null || recorded === head) continue;
    stale.push({ name: sub.name, path: sub.path });
  }
  if (stale.length === 0) return null;
  const names = stale.map((s) => s.name);
  const message = `bump ${names.join(", ")}: sync to origin`;
  await git(root, [
    "commit",
    "--quiet",
    "-m",
    message,
    "--",
    ...stale.map((s) => s.path),
  ]);
  return { names, sha: await headSha(root), message };
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
 * Unless `bump` is off, stale pointers for submodules on their origin tip are
 * then committed, so a remote-only submodule change never leaves the metarepo
 * dirty after a sync.
 */
export function sync(root: string, options: SyncOptions = {}): Operation {
  const { bump = true } = options;
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

    if (bump) {
      progress("bumping pointers");
      try {
        const bumped = await bumpPointers(root);
        if (bumped) {
          report({
            name: "metarepo",
            state: "bumped",
            tone: "good",
            detail: `${short(bumped.sha)} ${bumped.message}`,
          });
        }
      } catch (error) {
        ok = false;
        report({ name: "metarepo", state: "error", tone: "bad", detail: errorDetail(error) });
      }
    }
    progress(null);
    return ok;
  };
}
