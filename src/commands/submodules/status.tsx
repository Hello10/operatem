import { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import { rowHasIssue, status, type StatusRow } from "../../ops/status";

interface StatusProps {
  fetch?: boolean;
  _originalCwd?: string;
}

const COLUMNS = ["repo", "branch", "dirty", "ahead", "behind", "pointer"] as const;
type Column = (typeof COLUMNS)[number];

function widths(rows: StatusRow[]): Record<Column, number> {
  const longest = (column: Column) =>
    Math.max(column.length, ...rows.map((row) => cells(row)[column].length)) + 1;
  return {
    repo: longest("repo"),
    branch: longest("branch"),
    dirty: longest("dirty"),
    ahead: longest("ahead"),
    behind: longest("behind"),
    pointer: 0,
  };
}

function cells(row: StatusRow): Record<Column, string> {
  const count = (n: number | null) => (n === null ? "-" : String(n));
  return {
    repo: row.name,
    branch: row.initialized ? row.branch : "not initialized",
    dirty: row.initialized ? String(row.dirty) : "",
    ahead: row.initialized ? count(row.ahead) : "",
    behind: row.initialized ? count(row.behind) : "",
    pointer: row.pointer
      ? `checkout ${row.pointer.checkout}, metarepo records ${row.pointer.recorded}`
      : row.initialized && row.name !== "metarepo"
        ? "ok"
        : "",
  };
}

function pad(text: string, width: number) {
  return width ? text.padEnd(width) : text;
}

function Status({ fetch = true, _originalCwd }: StatusProps) {
  const { exit } = useApp();
  const [rows, setRows] = useState<StatusRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    status(_originalCwd || process.cwd(), { fetch }).then(setRows, (e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  useEffect(() => {
    if (rows === null && error === null) return;
    /* Informational: rows needing attention are highlighted, not a failure. */
    process.exitCode = error ? 1 : 0;
    exit();
  }, [rows, error]);

  if (error) return <Text color="red">✗ {error}</Text>;
  if (rows === null)
    return process.stdout.isTTY ? (
      <Text color="yellow">{fetch ? "fetching" : "reading"} repos...</Text>
    ) : null;

  const width = widths(rows);
  return (
    <Box flexDirection="column">
      <Text bold>{COLUMNS.map((c) => pad(c, width[c])).join(" ")}</Text>
      {rows.map((row) => {
        const c = cells(row);
        const issue = rowHasIssue(row);
        return (
          <Text key={row.name} color={issue ? "yellow" : undefined}>
            {COLUMNS.map((column) => pad(c[column], width[column])).join(" ")}
          </Text>
        );
      })}
      {rows.some(rowHasIssue) ? (
        <Text color="gray">
          {"\n"}yellow rows need attention: detached, dirty, ahead/behind, no
          upstream, or a pointer that differs from the checkout
        </Text>
      ) : (
        <Text color="cyan">{"\n"}everything is attached, clean, and in sync</Text>
      )}
    </Box>
  );
}

export const statusCommand = {
  name: "status",
  description: "Show branch, changes, ahead/behind, and pointer state for every repo",
  args: [],
  flags: [
    {
      name: "fetch",
      description: "Fetch before comparing (default on; use --no-fetch to skip)",
      required: false,
    },
  ],
  example: "status",
  component: Status,
  validate: () => ({ valid: true }),
};
