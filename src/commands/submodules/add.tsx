import { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { execa } from "execa";

import { loadConfig } from "../../config";

interface AddSubmoduleProps {
  url: string;
  name?: string;
  _originalCwd?: string;
}

function AddSubmodule({ url, name, _originalCwd }: AddSubmoduleProps) {
  const repoName = name || extractRepoName(url);
  const [status, setStatus] = useState<"adding" | "success" | "error">(
    "adding",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const addSubmodule = async () => {
      try {
        setStatus("adding");
        setMessage(`Adding submodule ${repoName}...`);

        const targetCwd = _originalCwd || process.cwd();
        const config = loadConfig(targetCwd);

        await execa(
          "git",
          ["submodule", "add", url, `${config.submodules}/${repoName}`],
          {
            cwd: targetCwd,
          },
        );

        setStatus("success");
        setMessage(`✅ Successfully added submodule ${repoName}`);

        setTimeout(() => process.exit(0), 1000);
      } catch (error) {
        setStatus("error");
        setMessage(
          `❌ Failed to add submodule: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setTimeout(() => process.exit(1), 2000);
      }
    };

    addSubmodule();
  }, [url, repoName]);

  return (
    <Box>
      <Text
        color={
          status === "error" ? "red" : status === "success" ? "green" : "yellow"
        }
      >
        {message}
      </Text>
    </Box>
  );
}

function extractRepoName(url: string): string {
  // Handle both SSH and HTTPS URLs
  // git@github.com:Hello10/brand.git -> brand
  // https://github.com/Hello10/brand.git -> brand
  const match = url.match(/([^\/]+?)(?:\.git)?$/);
  return match ? match[1] : "repo";
}

export const add = {
  name: "add",
  description: "Add a new submodule",
  args: [],
  flags: [
    { name: "url", description: "Git repository URL", required: true },
    {
      name: "name",
      description: "Submodule name (defaults to repo name)",
      required: false,
    },
  ],
  example: "add --url git@github.com:Hello10/brand.git",
  component: AddSubmodule,
  validate: (args: string[], flags: Record<string, any> = {}) => {
    if (!flags.url) {
      return { valid: false, error: "add command requires --url flag" };
    }
    return { valid: true };
  },
};
