/**
 * Imported before Ink. When stdout is not a terminal (piped, captured by a
 * script), Ink's CI mode prints static output immediately and skips the
 * cursor-movement redraws, so logs stay clean.
 */
if (!process.stdout.isTTY && process.env.CI === undefined) {
	process.env.CI = "true";
}
