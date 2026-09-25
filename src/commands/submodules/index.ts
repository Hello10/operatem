import { add } from './add';
import { list } from './list';
import { sync } from './sync';
import { push } from './push';

export const submodules = {
  name: 'submodules',
  description: 'Manage git submodules',
  aliases: ['subs'],
  commands: {
    add,
    list,
    sync,
    push
  }
};
