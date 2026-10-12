/**
 * Renders the command reference for README.md from the command definitions,
 * so the docs cannot drift from what the CLI accepts. `scripts/docs.ts` is
 * the runner (`pnpm run docs`, `pnpm run docs --check`).
 */
import * as commands from "./commands";
import type { CommandDefinition, CommandGroup } from "./CommandDefinition";

const START = "<!-- commands:start -->";
const END = "<!-- commands:end -->";

function signature(prefix: string, cmd: CommandDefinition): string {
  const args = cmd.args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`));
  const flags = (cmd.flags ?? []).map((f) => {
    const name = f.name === "message" ? "-m <message>" : `--${f.name}`;
    return f.required ? name : `[${name}]`;
  });
  return [prefix, cmd.name, ...args, ...flags].filter(Boolean).join(" ");
}

function flagList(cmd: CommandDefinition): string[] {
  return (cmd.flags ?? []).map((f) => {
    const name = f.name === "message" ? "`-m`, `--message`" : `\`--${f.name}\``;
    return `  - ${name}: ${f.description}`;
  });
}

export function renderCommands(): string {
  const items = Object.values(commands) as Array<CommandDefinition | CommandGroup>;
  const lines: string[] = [];
  for (const item of items) {
    if ("commands" in item) {
      const alias = item.aliases?.length ? ` (alias: ${item.aliases.join(", ")})` : "";
      lines.push(`### ${item.name}${alias}`, "", item.description, "");
      for (const cmd of Object.values(item.commands)) {
        lines.push(`- \`operatem ${signature(item.name, cmd)}\``, `  ${cmd.description}`);
        lines.push(...flagList(cmd));
      }
      lines.push("");
    } else {
      lines.push(`### ${item.name}`, "", `- \`operatem ${signature("", item)}\``, `  ${item.description}`);
      lines.push(...flagList(item), "");
    }
  }
  return lines.join("\n").trimEnd();
}

export function updateReadme(readme: string): string {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start)
    throw new Error(`README.md needs ${START} and ${END} markers`);
  return `${readme.slice(0, start + START.length)}\n\n${renderCommands()}\n\n${readme.slice(end)}`;
}
