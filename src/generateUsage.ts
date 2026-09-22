import * as commands from "./commands";
import type { CommandDefinition, CommandGroup } from "./CommandDefinition";

export function generateUsage(): string {
  // Get unique items (avoid duplicates from exports)
  const seenNames = new Set<string>();
  const uniqueItems = (
    Object.values(commands) as Array<CommandDefinition | CommandGroup>
  ).filter((item) => {
    const name = item.name;
    if (seenNames.has(name)) {
      return false;
    }
    seenNames.add(name);
    return true;
  });

  const commandLines: string[] = [];
  const examples: string[] = [];

  uniqueItems.forEach((item) => {
    if ("commands" in item) {
      // It's a command group
      const group = item;
      const groupName =
        group.aliases && group.aliases.length > 0
          ? `${group.name} (${group.aliases.join(", ")})`
          : group.name;
      commandLines.push(`  ${groupName}:`);

      Object.values(group.commands).forEach((cmd) => {
        const argStr = cmd.args
          .map((arg) => (arg.required ? `<${arg.name}>` : `[${arg.name}]`))
          .join(" ");

        const flagStr = cmd.flags
          ? cmd.flags
              .map((flag) =>
                flag.required
                  ? `--${flag.name} <value>`
                  : `[--${flag.name} <value>]`,
              )
              .join(" ")
          : "";

        const fullCmd = `${group.name} ${cmd.name} ${argStr} ${flagStr}`.trim();

        commandLines.push(
          `    ${fullCmd}${" ".repeat(Math.max(1, 50 - fullCmd.length))}${cmd.description}`,
        );

        if (cmd.example) {
          examples.push(`    $ operatem ${group.name} ${cmd.example}`);
        }
      });
    } else {
      // It's an individual command
      const cmd = item;
      const argStr = cmd.args
        .map((arg) => (arg.required ? `<${arg.name}>` : `[${arg.name}]`))
        .join(" ");

      const flagStr = cmd.flags
        ? cmd.flags
            .map((flag) =>
              flag.required
                ? `--${flag.name} <value>`
                : `[--${flag.name} <value>]`,
            )
            .join(" ")
        : "";

      const fullCmd = `${cmd.name} ${argStr} ${flagStr}`.trim();

      commandLines.push(
        `  ${fullCmd}${" ".repeat(Math.max(1, 50 - fullCmd.length))}${cmd.description}`,
      );

      if (cmd.example) {
        examples.push(`    $ operatem ${cmd.example}`);
      }
    }

    commandLines.push("");
  });

  return `
  Usage
    $ operatem <group> <command> [args...]

  Commands
${commandLines.join("\n")}
  Examples
${examples.join("\n")}
`;
}
