/* Rewrites the README command reference; --check only reports staleness. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { updateReadme } from "../src/docs";

const readmePath = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"README.md",
);
const current = readFileSync(readmePath, "utf-8");
const next = updateReadme(current);

if (process.argv.includes("--check")) {
	if (current !== next) {
		console.error(
			"README.md command reference is out of date; run `pnpm run docs`",
		);
		process.exit(1);
	}
	console.log("README.md command reference is up to date");
} else {
	writeFileSync(readmePath, next);
	console.log(
		current === next
			? "README.md already current"
			: "README.md command reference updated",
	);
}
