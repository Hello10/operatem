#!/usr/bin/env node

import React from "react";
import meow from "meow";
import { render } from "ink";

// Store the original working directory from the environment
const originalCwd = process.env.ORIGINAL_CWD || process.cwd();

import * as commands from "./commands";
import { generateUsage } from "./generateUsage";
import { CommandDefinition, CommandGroup } from "./CommandDefinition";

const cli = meow(generateUsage(), {
  importMeta: import.meta,
  flags: {
    url: { type: "string" },
    name: { type: "string" },
    workspace: { type: "string" },
    parallel: { type: "boolean" },
    help: {
      type: "boolean",
      shortFlag: "h",
    },
    version: {
      type: "boolean",
      shortFlag: "v",
    },
  },
});

const [groupName, commandName, ...originalArgs] = cli.input;
let args = originalArgs;

if (!groupName) {
  cli.showHelp();
  process.exit(0);
}

// Check if it's a command group or individual command (including aliases)
const commandsObj = commands as Record<
  string,
  CommandGroup | CommandDefinition
>;
let item = commandsObj[groupName];

// If not found, check for aliases
if (!item) {
  for (const cmd of Object.values(commandsObj)) {
    if ("aliases" in cmd && cmd.aliases?.includes(groupName)) {
      item = cmd;
      break;
    }
  }
}

if (!item) {
  console.error(`Error: Unknown command '${groupName}'`);
  cli.showHelp();
  process.exit(1);
}

let command: CommandDefinition;

// Check if it's a command group (has 'commands' property) or individual command
if ("commands" in item) {
  // It's a command group
  const group = item as CommandGroup;

  if (!commandName) {
    console.error(`Error: No command specified for group '${groupName}'`);
    console.error(
      `Available commands: ${Object.keys(group.commands).join(", ")}`,
    );
    process.exit(1);
  }

  const groupCommand = group.commands[commandName];
  if (!groupCommand) {
    console.error(
      `Error: Unknown command '${commandName}' in group '${groupName}'`,
    );
    console.error(
      `Available commands: ${Object.keys(group.commands).join(", ")}`,
    );
    process.exit(1);
  }

  command = groupCommand;
} else {
  // It's an individual command
  command = item as CommandDefinition;
  // Shift args since we consumed the command name
  args = [commandName, ...args];
}

const validation = command.validate(args, cli.flags);
if (!validation.valid) {
  console.error(`Error: ${validation.error}`);
  cli.showHelp();
  process.exit(1);
}

const props: Record<string, any> = {};
command.args.forEach((argDef, index) => {
  if (args[index] !== undefined) {
    props[argDef.name] = args[index];
  }
});

// Add flags to props
if (command.flags) {
  command.flags.forEach((flagDef) => {
    if (cli.flags[flagDef.name] !== undefined) {
      props[flagDef.name] = cli.flags[flagDef.name];
    }
  });
}

// Pass the original working directory to the component
props._originalCwd = originalCwd;

render(React.createElement(command.component, props));
