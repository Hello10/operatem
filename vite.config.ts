import { defineConfig } from "vite-plus";

// Lint and format only: the CLI still runs from source through tsx, and the
// tests still run under node --test. lint, fmt, and staged match
// @hello10/config-vite-plus; switch to importing them once it is published.
export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	lint: {
		jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
		options: { typeAware: true, typeCheck: true },
		rules: {
			"vite-plus/prefer-vite-plus-imports": "error",
			"no-unused-vars": [
				"warn",
				{ args: "all", argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},
	fmt: {
		useTabs: true,
		printWidth: 80,
		sortImports: {},
		sortPackageJson: false,
		ignorePatterns: ["**/*.md"],
	},
});
