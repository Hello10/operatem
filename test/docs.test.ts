import { test } from "node:test";
import assert from "node:assert/strict";
import { renderCommands, updateReadme } from "../src/docs";

test("renders every command group into the README section", () => {
  const rendered = renderCommands();
  assert.match(rendered, /### submodules \(alias: subs\)/);
  assert.match(rendered, /`operatem submodules sync`/);
  assert.match(rendered, /`operatem submodules commit -m <message>/);
  assert.match(rendered, /### run/);
});

test("updateReadme replaces only the marked section and is idempotent", () => {
  const readme = "# x\n\nintro\n\n<!-- commands:start -->\nold\n<!-- commands:end -->\n\nouttro\n";
  const once = updateReadme(readme);
  assert.match(once, /^# x\n\nintro\n\n<!-- commands:start -->\n\n### /);
  assert.match(once, /<!-- commands:end -->\n\nouttro\n$/);
  assert.doesNotMatch(once, /\nold\n/);
  assert.equal(updateReadme(once), once);
  assert.throws(() => updateReadme("no markers"), /markers/);
});
