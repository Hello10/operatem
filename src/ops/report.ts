/* One line of command output. Operations emit these; the UI renders them. */
export interface Line {
  name: string;
  state: string;
  tone: "good" | "muted" | "warn" | "bad";
  detail?: string;
}

export type Report = (line: Line) => void;
export type Progress = (label: string | null) => void;

/* Every operation resolves to true when nothing failed. */
export type Operation = (report: Report, progress: Progress) => Promise<boolean>;

export function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* Match a --workspace value against a submodule by name or path. */
export function matchesWorkspace(
  workspace: string | undefined,
  sub: { name: string; path: string },
): boolean {
  if (!workspace) return true;
  return (
    sub.name === workspace ||
    sub.path === workspace ||
    sub.path.split("/").pop() === workspace
  );
}
