import { join } from "node:path";
import {
  aheadBehind,
  currentBranch,
  git,
  isDirty,
  listSubmodules,
  upstream,
} from "../git";
import { errorDetail, type Line, type Operation } from "./report";

type PushState = "pushed" | "up-to-date" | "diverged" | "detached" | "no-upstream";

const TONE: Record<PushState, Line["tone"]> = {
  pushed: "good",
  "up-to-date": "muted",
  diverged: "bad",
  detached: "bad",
  "no-upstream": "bad",
};

async function pushRepo(cwd: string, pushArgs: string[] = []): Promise<PushState> {
  if ((await currentBranch(cwd)) === "HEAD") return "detached";
  if (!(await upstream(cwd))) return "no-upstream";
  await git(cwd, ["fetch", "--quiet"]);
  const { ahead, behind } = await aheadBehind(cwd);
  if (ahead === 0) return "up-to-date";
  if (behind > 0) return "diverged";
  await git(cwd, ["push", "--quiet", ...pushArgs]);
  return "pushed";
}

const DETAIL: Partial<Record<PushState, string>> = {
  detached: "run sync to attach a branch",
  "no-upstream": "branch has no upstream to push to",
  diverged: "behind origin; pull first",
};

/* Push every submodule that is ahead, then the metarepo. */
export function push(root: string): Operation {
  return async (report, progress) => {
    let ok = true;
    for (const sub of await listSubmodules(root)) {
      if (!sub.initialized) continue;
      progress(`pushing ${sub.name}`);
      const cwd = join(root, sub.path);
      try {
        const state = await pushRepo(cwd);
        if (TONE[state] === "bad") ok = false;
        const dirty = await isDirty(cwd);
        report({
          name: sub.name,
          state,
          tone: TONE[state],
          detail: dirty ? "has uncommitted changes (not pushed)" : DETAIL[state],
        });
      } catch (error) {
        ok = false;
        report({ name: sub.name, state: "error", tone: "bad", detail: errorDetail(error) });
      }
    }

    progress("pushing metarepo");
    try {
      /* Submodules were pushed above; on-demand is the safety net that refuses
         the push if a recorded submodule commit is still missing from its remote. */
      const state = await pushRepo(root, ["--recurse-submodules=on-demand"]);
      if (TONE[state] === "bad") ok = false;
      report({ name: "metarepo", state, tone: TONE[state], detail: DETAIL[state] });
    } catch (error) {
      ok = false;
      report({ name: "metarepo", state: "error", tone: "bad", detail: errorDetail(error) });
    }
    progress(null);
    return ok;
  };
}
