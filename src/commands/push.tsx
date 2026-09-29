import { RunOperation } from "../ui/Operation";
import { push as pushOperation } from "../ops/push";

interface PushProps {
  _originalCwd?: string;
}

function Push({ _originalCwd }: PushProps) {
  return (
    <RunOperation
      title="push"
      operation={pushOperation(_originalCwd || process.cwd())}
    />
  );
}

export const push = {
  name: "push",
  description: "Push submodules that are ahead, then the metarepo",
  args: [],
  example: "push",
  component: Push,
  validate: () => ({ valid: true }),
};
