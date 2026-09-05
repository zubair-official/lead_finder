/**
 * Download the Chromium the scraper needs.
 *
 * Skipped where no browser will ever be launched: Netlify only builds the
 * static demo, and the Docker image already ships with browsers installed.
 * Without this, a demo deploy would pull ~150MB for nothing.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const skip = process.env.NETLIFY || process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || process.env.SKIP_BROWSER_DOWNLOAD;

if (skip) {
  console.log("postinstall: skipping the Chromium download (no browser needed in this build).");
  process.exit(0);
}

// Resolved by path, not by import: playwright's package exports map does not
// expose cli.js, so createRequire().resolve() throws on it.
const cli = path.join(ROOT, "node_modules", "playwright", "cli.js");

if (!existsSync(cli)) {
  console.warn(`postinstall: could not find ${path.relative(ROOT, cli)}.`);
  console.warn("postinstall: run 'npx playwright install chromium' before your first search.");
  process.exit(0); // a failed browser download should not fail the install
}

const result = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
if (result.status !== 0) {
  console.warn("postinstall: the Chromium download did not finish. Run 'npx playwright install chromium' manually.");
}
process.exit(0);
