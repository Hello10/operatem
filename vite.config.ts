import { fmt, lint, staged } from "@hello10/config-vite-plus/base";
import { defineConfig } from "vite-plus";

// Lint and format only: the CLI still runs from source through tsx, and the
// tests still run under node --test.
export default defineConfig({
	staged,
	lint,
	fmt,
});
