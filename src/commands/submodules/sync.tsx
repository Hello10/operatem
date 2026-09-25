import { useState, useEffect } from "react";
import { Text, Box } from "ink";
import {
  git,
  isDirty,
  currentBranch,
  headSha,
  listSubmodules,
} from "../../git";

interface RepoResult {
  name: string;
  state:
    | "updated"
    | "up-to-date"
    | "initialized"
    | "skipped-dirty"
    | "diverged"
    | "error";
  detail?: string;
}

const COLORS: Record<RepoResult["state"], string> = {
  updated: "green",
  "up-to-date": "gray",
  initialized: "green",
  "skipped-dirty": "yellow",
  diverged: "red",
  error: "red",
};

async function syncRepo(
  cwd: string,
  { ignoreSubmodules = false } = {},
): Promise<RepoResult["state"]> {
  await git(cwd, ["fetch"]);
  if (await isDirty(cwd, { ignoreSubmodules })) return "skipped-dirty";
  const before = await headSha(cwd);
  try {
    await git(cwd, ["pull", "--ff-only"]);
  } catch {
    return "diverged";
  }
  return (await headSha(cwd)) === before ? "up-to-date" : "updated";
}

interface SyncSubmodulesProps {
  _originalCwd?: string;
}

function SyncSubmodules({ _originalCwd }: SyncSubmodulesProps) {
  const [results, setResults] = useState<RepoResult[]>([]);
  const [running, setRunning] = useState<string | null>("metarepo");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const run = async () => {
      const root = _originalCwd || process.cwd();
      const report = (result: RepoResult) =>
        setResults((prev) => [...prev, result]);

      let failed = false;
      try {
        report({
          name: "metarepo",
          state: await syncRepo(root, { ignoreSubmodules: true }),
        });
      } catch (error) {
        failed = true;
        report({
          name: "metarepo",
          state: "error",
          detail: error instanceof Error ? error.message : String(error),
        });
      }

      for (const sub of await listSubmodules(root)) {
        setRunning(sub.path);
        const cwd = `${root}/${sub.path}`;
        try {
          if (!sub.initialized) {
            await git(root, ["submodule", "update", "--init", sub.path]);
            report({ name: sub.path, state: "initialized" });
            continue;
          }
          const branch = await currentBranch(cwd);
          if (branch === "HEAD") {
            report({
              name: sub.path,
              state: "error",
              detail: "detached HEAD — checkout a branch first",
            });
            failed = true;
            continue;
          }
          const state = await syncRepo(cwd);
          if (state === "diverged") failed = true;
          report({ name: sub.path, state });
        } catch (error) {
          failed = true;
          report({
            name: sub.path,
            state: "error",
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }

      setRunning(null);
      setDone(true);
      setTimeout(() => process.exit(failed ? 1 : 0), 500);
    };
    run();
  }, []);

  return (
    <Box flexDirection="column">
      {results.map((result) => (
        <Box key={result.name}>
          <Text color={COLORS[result.state]}>
            {result.state === "error" || result.state === "diverged"
              ? "✗"
              : "✓"}{" "}
            {result.name}: {result.state}
          </Text>
          {result.detail && <Text color="gray"> — {result.detail}</Text>}
        </Box>
      ))}
      {running && <Text color="yellow">syncing {running}...</Text>}
      {done && <Text color="cyan">sync complete</Text>}
    </Box>
  );
}

export const sync = {
  name: "sync",
  description: "Fast-forward the metarepo and all submodule branches",
  args: [],
  example: "sync",
  component: SyncSubmodules,
  validate: () => ({ valid: true }),
};
