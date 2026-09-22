import { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { execa } from "execa";
import { discoverWorkspaces } from "../workspace";

interface InstallProps {
  workspace?: string;
  parallel?: boolean;
  _originalCwd?: string;
}

function Install({ workspace, parallel = false, _originalCwd }: InstallProps) {
  const [status, setStatus] = useState<"running" | "success" | "error">(
    "running",
  );
  const [results, setResults] = useState<
    Array<{ workspace: string; success: boolean; output: string }>
  >([]);

  useEffect(() => {
    const install = async () => {
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

        const executeInstall = async (ws: (typeof targetWorkspaces)[0]) => {
          try {
            let command: string;
            let args: string[];

            // Map to install command based on workspace type
            switch (ws.type) {
              case "node":
                // Could detect pnpm/yarn later, for now use npm
                command = ws.packageManager || "npm";
                args = ["install"];
                break;
              case "python":
                command = "uv";
                args = ["sync"];
                break;
              case "rust":
                // Rust handles deps automatically, but we can run cargo fetch
                command = "cargo";
                args = ["fetch"];
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
              output: stdout || stderr || `✅ Dependencies installed`,
            };
          } catch (error: any) {
            return {
              workspace: ws.name,
              success: false,
              output: error.message || `❌ Install failed`,
            };
          }
        };

        let results: Awaited<ReturnType<typeof executeInstall>>[];

        if (parallel) {
          results = await Promise.all(targetWorkspaces.map(executeInstall));
        } else {
          results = [];
          for (const ws of targetWorkspaces) {
            const result = await executeInstall(ws);
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
            output: `Failed to install: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ]);
      }
    };

    install();
  }, [workspace, parallel, _originalCwd]);

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>
        Installing dependencies:
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

      {status === "running" && <Text color="yellow">Installing...</Text>}
    </Box>
  );
}

export const install = {
  name: "install",
  description: "Install dependencies for all workspaces",
  args: [],
  flags: [
    {
      name: "workspace",
      description: "Install only in specific workspace",
      required: false,
    },
    { name: "parallel", description: "Install in parallel", required: false },
  ],
  example: "install --workspace brand",
  component: Install,
  validate: () => ({ valid: true }),
};
