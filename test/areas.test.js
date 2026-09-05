import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAreas } from "../src/areas.js";

describe("parseAreas", () => {
  it("treats a plain city as one search", () => {
    assert.deepEqual(parseAreas("Lahore"), ["Lahore"]);
  });

  it("splits a comma-separated sweep", () => {
    assert.deepEqual(
      parseAreas("Gulberg Lahore, DHA Lahore, Model Town Lahore"),
      ["Gulberg Lahore", "DHA Lahore", "Model Town Lahore"],
    );
  });

  it("ignores empty segments and stray commas", () => {
    assert.deepEqual(parseAreas("Gulberg, , DHA,"), ["Gulberg", "DHA"]);
  });

  it("drops a repeated area regardless of case or spacing", () => {
    assert.deepEqual(parseAreas("Gulberg Lahore, gulberg  lahore"), ["Gulberg Lahore"]);
  });

  it("collapses internal whitespace", () => {
    assert.deepEqual(parseAreas("  Model   Town  "), ["Model Town"]);
  });

  it("returns nothing for empty input", () => {
    assert.deepEqual(parseAreas(""), []);
    assert.deepEqual(parseAreas("   "), []);
    assert.deepEqual(parseAreas(null), []);
  });
});
