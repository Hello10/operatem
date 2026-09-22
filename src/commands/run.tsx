import { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { execa } from "execa";
import { discoverWorkspaces } from "../workspace";

interface RunScriptProps {
  script: string;
  workspace?: string;
  parallel?: boolean;
  _originalCwd?: string;
}

function RunScript({
  script,
  workspace,
  parallel = false,
  _originalCwd,
}: RunScriptProps) {
  const [status, setStatus] = useState<"running" | "success" | "error">(
    "running",
  );
  const [results, setResults] = useState<
    Array<{ workspace: string; success: boolean; output: string }>
  >([]);

  useEffect(() => {
    const runScript = async () => {
      try {
        const basePath = _originalCwd || process.cwd();
        const workspaces = discoverWorkspaces(basePath);

        // Filter workspaces if specific workspace requested
        const targetWorkspaces = workspace
          ? workspaces.filter((w) => w.name === workspace)
          : workspaces;

        if (targetWorkspaces.length === 0) {
          process.exitCode = 1;
          setStatus("error");
          setResults([
            {
              workspace: workspace || "all",
              success: false,
              output: `No workspaces found${workspace ? ` matching "${workspace}"` : ""}`,
            },
          ]);
          return;
        }

        // Filter workspaces that have the requested script
        const runnableWorkspaces = targetWorkspaces.filter(
          (w) => w.scripts[script],
        );

        if (runnableWorkspaces.length === 0) {
          process.exitCode = 1;
          setStatus("error");
          setResults([
            {
              workspace: workspace || "all",
              success: false,
              output: `No workspaces have script "${script}"`,
            },
          ]);
          return;
        }

        const executeInWorkspace = async (
          ws: (typeof runnableWorkspaces)[0],
        ) => {
          try {
            let command: string;
            let args: string[];

            // Map script to actual command based on workspace type
            switch (ws.type) {
              case "node":
                command = ws.packageManager || "npm";
                args = ["run", script];
                break;
              case "python":
                if (script === "install") {
                  command = "uv";
                  args = ["sync"];
                } else {
                  command = "uv";
                  args = ["run", script];
                }
                break;
              case "rust":
                command = "cargo";
                args = [script];
                break;
              default:
                throw new Error(`Unknown workspace type: ${ws.type}`);
            }

            const { stdout, stderr } = await execa(command, args, {
              cwd: ws.path,
              all: true,
            });

            return {
              workspace: ws.name,
              success: true,
              output: stdout || stderr || `✅ ${script} completed`,
            };
          } catch (error: any) {
            return {
              workspace: ws.name,
              success: false,
              output: error.message || `❌ ${script} failed`,
            };
          }
        };

        let results: Awaited<ReturnType<typeof executeInWorkspace>>[];

        if (parallel) {
          results = await Promise.all(
            runnableWorkspaces.map(executeInWorkspace),
          );
        } else {
          results = [];
          for (const ws of runnableWorkspaces) {
            const result = await executeInWorkspace(ws);
            results.push(result);
          }
        }

        setResults(results);
        const success = results.every((r) => r.success);
        process.exitCode = success ? 0 : 1;
        setStatus(success ? "success" : "error");
      } catch (error) {
        process.exitCode = 1;
        setStatus("error");
        setResults([
          {
            workspace: "unknown",
            success: false,
            output: `Failed to run script: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ]);
      }
    };

    runScript();
  }, [script, workspace, parallel, _originalCwd]);

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>
        Running script "{script}":
      </Text>

      {results.map((result, index) => (
        <Box key={index} flexDirection="column" marginTop={1}>
          <Text color={result.success ? "green" : "red"}>
            {result.success ? "✅" : "❌"} {result.workspace}
          </Text>
          {result.output && (
            <Box marginLeft={2}>
              <Text color="dim">{result.output}</Text>
            </Box>
          )}
        </Box>
      ))}

      {status === "running" && <Text color="yellow">Running...</Text>}
    </Box>
  );
}

export const run = {
  name: "run",
  description: "Run a script across workspaces",
  args: [{ name: "script", description: "Script name to run", required: true }],
  flags: [
    {
      name: "workspace",
      description: "Run only in specific workspace",
      required: false,
    },
    { name: "parallel", description: "Run in parallel", required: false },
  ],
  example: "run build --workspace brand",
  component: RunScript,
  validate: (args: string[], flags: Record<string, any> = {}) => {
    if (args.length < 1) {
      return { valid: false, error: "run command requires a script name" };
    }
    return { valid: true };
  },
};
