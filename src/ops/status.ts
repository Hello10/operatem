import { join } from "node:path";
import {
  aheadBehind,
  currentBranch,
  dirtyCount,
  git,
  headSha,
  listSubmodules,
  recordedSha,
  short,
  upstream,
} from "../git";

export interface StatusRow {
  name: string;
  /* Branch name, or "detached". */
  branch: string;
  /* Changed paths in the working tree. */
  dirty: number;
  /* Null when the branch has no upstream. */
  ahead: number | null;
  behind: number | null;
  /* Null for the metarepo, and when the checkout matches the recorded pointer. */
  pointer: { recorded: string; checkout: string } | null;
  initialized: boolean;
}

export interface StatusOptions {
  fetch?: boolean;
}

export function rowHasIssue(row: StatusRow): boolean {
  return (
    !row.initialized ||
    row.branch === "detached" ||
    row.dirty > 0 ||
    row.ahead === null ||
    row.ahead > 0 ||
    (row.behind ?? 0) > 0 ||
    row.pointer !== null
  );
}

async function repoRow(
  cwd: string,
  name: string,
  { fetch = true, ignoreSubmodules = false } = {},
): Promise<Omit<StatusRow, "pointer">> {
  if (fetch) await git(cwd, ["fetch", "--quiet"]);
  const branchName = await currentBranch(cwd);
  const branch = branchName === "HEAD" ? "detached" : branchName;
  const dirty = await dirtyCount(cwd, { ignoreSubmodules });
  let ahead: number | null = null;
  let behind: number | null = null;
  if (branch !== "detached" && (await upstream(cwd))) {
    ({ ahead, behind } = await aheadBehind(cwd));
  }
  return { name, branch, dirty, ahead, behind, initialized: true };
}

/* Rows for the metarepo and every submodule, metarepo first. */
export async function status(
  root: string,
  { fetch = true }: StatusOptions = {},
): Promise<StatusRow[]> {
  const rows: StatusRow[] = [];
  rows.push({
    ...(await repoRow(root, "metarepo", { fetch, ignoreSubmodules: true })),
    pointer: null,
  });
  for (const sub of await listSubmodules(root)) {
    if (!sub.initialized) {
      rows.push({
        name: sub.name,
        branch: "-",
        dirty: 0,
        ahead: null,
        behind: null,
        pointer: null,
        initialized: false,
      });
      continue;
    }
    const cwd = join(root, sub.path);
    const row = await repoRow(cwd, sub.name, { fetch });
    const recorded = await recordedSha(root, sub.path);
    const checkout = await headSha(cwd);
    rows.push({
      ...row,
      pointer:
        recorded && recorded !== checkout
          ? { recorded: short(recorded), checkout: short(checkout) }
          : null,
    });
  }
  return rows;
}
