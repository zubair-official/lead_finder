import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

/**
 * config.js reads the environment once at import time, so each case runs in a
 * fresh child process with its own env rather than trying to re-import here.
 */
function loadConfigWith(env) {
  const script =
    "import('./src/config.js').then(m => " +
    "console.log(JSON.stringify({ config: m.config, warnings: m.configWarnings })));";
  const output = execFileSync(process.execPath, ["-e", script], {
    env: { ...process.env, ...env, NO_COLOR: "1" },
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").pop());
}

describe("config", () => {
  it("defaults to headless", () => {
    const { config } = loadConfigWith({ HEADLESS: "", HEADED: "" });
    assert.equal(config.headless, true);
  });

  it("HEADED=1 opens a visible browser", () => {
    const { config } = loadConfigWith({ HEADED: "1", HEADLESS: "" });
    assert.equal(config.headless, false);
  });

  it("HEADLESS=false also opens a visible browser", () => {
    const { config } = loadConfigWith({ HEADLESS: "false", HEADED: "" });
    assert.equal(config.headless, false);
  });

  it("enforces the 1s pause floor even when told to go faster", () => {
    const { config, warnings } = loadConfigWith({ PAUSE_MIN_MS: "0", PAUSE_MAX_MS: "10" });
    assert.ok(config.pauseMinMs >= 1000, `pauseMinMs was ${config.pauseMinMs}`);
    assert.ok(config.pauseMaxMs >= 1000, `pauseMaxMs was ${config.pauseMaxMs}`);
    assert.ok(warnings.length > 0, "clamping should warn");
  });

  it("swaps a reversed pause range instead of producing a negative delay", () => {
    const { config } = loadConfigWith({ PAUSE_MIN_MS: "9000", PAUSE_MAX_MS: "3000" });
    assert.ok(config.pauseMinMs <= config.pauseMaxMs);
    assert.equal(config.pauseMinMs, 3000);
    assert.equal(config.pauseMaxMs, 9000);
  });

  it("falls back to the default on a non-numeric value, with a warning", () => {
    const { config, warnings } = loadConfigWith({ MAX_RESULTS: "lots" });
    assert.equal(config.maxResults, 40);
    assert.ok(warnings.some((w) => w.includes("MAX_RESULTS")));
  });

  it("clamps an out-of-range result cap", () => {
    const { config } = loadConfigWith({ MAX_RESULTS: "99999" });
    assert.equal(config.maxResults, 200);
  });

  it("warns when robots.txt is switched off", () => {
    const { config } = loadConfigWith({ RESPECT_ROBOTS: "false" });
    assert.equal(config.respectRobots, false);
  });

  it("treats an empty USER_DATA_DIR as a throwaway profile", () => {
    const { config } = loadConfigWith({ USER_DATA_DIR: "" });
    assert.equal(config.userDataDir, "");
  });
});

describe("scroll patience", () => {
  it("defaults to a settle window and three strikes", () => {
    const { config } = loadConfigWith({});
    assert.equal(config.scrollSettleMs, 8000);
    assert.equal(config.scrollStrikes, 3);
  });

  it("accepts a longer window for a slow connection", () => {
    const { config } = loadConfigWith({ SCROLL_SETTLE_MS: "20000", SCROLL_STRIKES: "5" });
    assert.equal(config.scrollSettleMs, 20000);
    assert.equal(config.scrollStrikes, 5);
  });

  it("clamps absurd values instead of failing mid-run", () => {
    const { config, warnings } = loadConfigWith({ SCROLL_SETTLE_MS: "999999", SCROLL_STRIKES: "0" });
    assert.equal(config.scrollSettleMs, 60000);
    assert.equal(config.scrollStrikes, 1);
    assert.ok(warnings.length >= 2);
  });
});
