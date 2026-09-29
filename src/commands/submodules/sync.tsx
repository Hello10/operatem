import { RunOperation } from "../../ui/Operation";
import { sync as syncOperation } from "../../ops/sync";

interface SyncProps {
  _originalCwd?: string;
}

function Sync({ _originalCwd }: SyncProps) {
  return (
    <RunOperation
      title="sync"
      operation={syncOperation(_originalCwd || process.cwd())}
    />
  );
}

export const sync = {
  name: "sync",
  description:
    "Fast-forward the metarepo and every submodule, attaching detached checkouts to their branch",
  args: [],
  example: "sync",
  component: Sync,
  validate: () => ({ valid: true }),
};
