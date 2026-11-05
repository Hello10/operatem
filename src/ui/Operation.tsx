import { Box, Static, Text, useApp } from "ink";
import { useEffect, useState } from "react";

import type { Line, Operation } from "../ops/report";

const COLOR: Record<Line["tone"], string> = {
	good: "green",
	muted: "gray",
	warn: "yellow",
	bad: "red",
};

interface RunOperationProps {
	title: string;
	operation: Operation;
}

/**
 * Runs an operation and renders its lines as they arrive. Finished lines go
 * through <Static>, so they print once and stay put even when output is piped.
 * The process exits through Ink once the operation resolves.
 */
export function RunOperation({ title, operation }: RunOperationProps) {
	const { exit } = useApp();
	const [lines, setLines] = useState<Line[]>([]);
	const [progress, setProgress] = useState<string | null>(null);
	const [ok, setOk] = useState<boolean | null>(null);

	useEffect(() => {
		operation(
			(line) => setLines((previous) => [...previous, line]),
			setProgress,
		).then(
			(result) => setOk(result),
			(error) => {
				setLines((previous) => [
					...previous,
					{
						name: title,
						state: "error",
						tone: "bad",
						detail: error instanceof Error ? error.message : String(error),
					},
				]);
				setOk(false);
			},
		);
	}, []);

	useEffect(() => {
		if (ok === null) return;
		process.exitCode = ok ? 0 : 1;
		/* Exit on the next tick so <Static> has committed the last line; exiting
       in the same commit makes Ink's final frame print that line twice. */
		const timer = setTimeout(exit, 0);
		return () => clearTimeout(timer);
	}, [ok]);

	return (
		<Box flexDirection="column">
			<Static items={lines}>
				{(line, index) => (
					<Text key={`${line.name}-${index}`} color={COLOR[line.tone]}>
						{line.tone === "bad" ? "✗" : "✓"} {line.name}: {line.state}
						{line.detail && <Text color="gray"> — {line.detail}</Text>}
					</Text>
				)}
			</Static>
			{progress && process.stdout.isTTY && (
				<Text color="yellow">{progress}...</Text>
			)}
			{ok !== null && (
				<Text color={ok ? "cyan" : "red"}>
					{title} {ok ? "complete" : "finished with errors"}
				</Text>
			)}
		</Box>
	);
}
