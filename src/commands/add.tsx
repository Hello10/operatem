import { RunOperation } from "../ui/Operation";
import { add as addOperation } from "../ops/add";

interface AddSubmoduleProps {
  url: string;
  name?: string;
  _originalCwd?: string;
}

function AddSubmodule({ url, name, _originalCwd }: AddSubmoduleProps) {
  return (
    <RunOperation
      title="add"
      operation={addOperation(_originalCwd || process.cwd(), { url, name })}
    />
  );
}

export const add = {
  name: "add",
  description:
    "Add a new submodule, syncing a metarepo that is behind origin first",
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
