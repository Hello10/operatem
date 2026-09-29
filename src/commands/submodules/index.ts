import { add } from "./add";
import { statusCommand } from "./status";
import { sync } from "./sync";
import { commit } from "./commit";
import { push } from "./push";

export const submodules = {
  name: "submodules",
  description: "Manage git submodules",
  aliases: ["subs"],
  commands: {
    status: statusCommand,
    sync,
    commit,
    push,
    add,
  },
};
