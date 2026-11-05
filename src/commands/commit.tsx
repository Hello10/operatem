import { commit as commitOperation } from "../ops/commit";
import { RunOperation } from "../ui/Operation";

interface CommitProps {
	message: string;
	workspace?: string;
	_originalCwd?: string;
}

function Commit({ message, workspace, _originalCwd }: CommitProps) {
	return (
		<RunOperation
			title="commit"
			operation={commitOperation(_originalCwd || process.cwd(), {
				message,
				workspace,
			})}
		/>
	);
}

export const commit = {
	name: "commit",
	description:
		"Commit dirty submodules with a message, then commit the metarepo pointers",
	args: [],
	flags: [
		{ name: "message", description: "Commit message (-m)", required: true },
		{
			name: "workspace",
			description: "Only commit this submodule",
			required: false,
		},
	],
	example: 'commit -m "lighter link underlines"',
	component: Commit,
	validate: (_args: string[], flags: Record<string, any> = {}) => {
		if (!flags.message)
			return { valid: false, error: "commit requires a message (-m)" };
		return { valid: true };
	},
};
