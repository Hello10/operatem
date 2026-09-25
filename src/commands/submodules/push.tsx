import { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { git, isDirty, aheadBehind, listSubmodules } from "../../git";

interface RepoResult {
  name: string;
  state: "pushed" | "up-to-date" | "diverged" | "error";
  detail?: string;
}

const COLORS: Record<RepoResult["state"], string> = {
  pushed: "green",
  "up-to-date": "gray",
  diverged: "red",
  error: "red",
};

async function pushRepo(cwd: string): Promise<RepoResult["state"]> {
  await git(cwd, ["fetch"]);
  const { ahead, behind } = await aheadBehind(cwd);
  if (ahead === 0) return "up-to-date";
  if (behind > 0) return "diverged";
  await git(cwd, ["push"]);
  return "pushed";
}

interface PushSubmodulesProps {
  _originalCwd?: string;
}

function PushSubmodules({ _originalCwd }: PushSubmodulesProps) {
  const [results, setResults] = useState<RepoResult[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const run = async () => {
      const root = _originalCwd || process.cwd();
      const report = (result: RepoResult) =>
        setResults((prev) => [...prev, result]);
      let failed = false;

      for (const sub of await listSubmodules(root)) {
        if (!sub.initialized) continue;
        setRunning(sub.path);
        const cwd = `${root}/${sub.path}`;
        try {
          if (await isDirty(cwd)) {
            setWarnings((prev) => [
              ...prev,
              `${sub.path} has uncommitted changes (not pushed)`,
            ]);
          }
          const state = await pushRepo(cwd);
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

      setRunning("metarepo");
      try {
        await git(root, ["fetch"]);
        const { ahead, behind } = await aheadBehind(root);
        if (ahead === 0) {
          report({ name: "metarepo", state: "up-to-date" });
        } else if (behind > 0) {
          failed = true;
          report({ name: "metarepo", state: "diverged" });
        } else {
          /* on-demand refuses the push if a committed submodule
             pointer is missing from its remote */
          await git(root, ["push", "--recurse-submodules=on-demand"]);
          report({ name: "metarepo", state: "pushed" });
        }
      } catch (error) {
        failed = true;
        report({
          name: "metarepo",
          state: "error",
          detail: error instanceof Error ? error.message : String(error),
        });
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
      {warnings.map((warning) => (
        <Text key={warning} color="yellow">
          ⚠ {warning}
        </Text>
      ))}
      {running && <Text color="yellow">pushing {running}...</Text>}
      {done && <Text color="cyan">push complete</Text>}
    </Box>
  );
}

export const push = {
  name: "push",
  description: "Push submodules first, then the metarepo",
  args: [],
  example: "push",
  component: PushSubmodules,
  validate: () => ({ valid: true }),
};
