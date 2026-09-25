import { execa } from "execa";

export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execa("git", args, { cwd });
  return stdout.trim();
}

export async function isDirty(
  cwd: string,
  { ignoreSubmodules = false } = {},
): Promise<boolean> {
  const args = ["status", "--porcelain"];
  if (ignoreSubmodules) args.push("--ignore-submodules=all");
  return (await git(cwd, args)) !== "";
}

export async function currentBranch(cwd: string): Promise<string> {
  return git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export async function headSha(cwd: string): Promise<string> {
  return git(cwd, ["rev-parse", "HEAD"]);
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

export interface SubmoduleStatus {
  path: string;
  sha: string;
  initialized: boolean;
}

export async function listSubmodules(cwd: string): Promise<SubmoduleStatus[]> {
  const out = await git(cwd, ["submodule", "status"]);
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => {
      const match = line.match(/^(.)([\da-f]+)\s+(\S+)/);
      if (!match) return null;
      const [, statusChar, sha, path] = match;
      return { path, sha, initialized: statusChar !== "-" };
    })
    .filter((s): s is SubmoduleStatus => s !== null);
}
