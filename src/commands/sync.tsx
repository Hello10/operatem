import { RunOperation } from "../ui/Operation";
import { sync as syncOperation } from "../ops/sync";

interface SyncProps {
  bump?: boolean;
  _originalCwd?: string;
}

function Sync({ bump = true, _originalCwd }: SyncProps) {
  return (
    <RunOperation
      title="sync"
      operation={syncOperation(_originalCwd || process.cwd(), { bump })}
    />
  );
}

export const sync = {
  name: "sync",
  description:
    "Bring the metarepo current (rebasing local commits onto origin), fast-forward every submodule, attaching detached checkouts to their branch, then commit stale pointers for submodules on their origin tip",
  args: [],
  flags: [
    {
      name: "bump",
      description:
        "Commit pointer bumps after syncing (default on; use --no-bump to skip)",
      required: false,
    },
  ],
  example: "sync",
  component: Sync,
  validate: () => ({ valid: true }),
};
