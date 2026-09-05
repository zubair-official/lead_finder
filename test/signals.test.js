import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyseSite, detectBuilder, isSocialOnly, latestCopyrightYear } from "../src/signals.js";
import { clearVerifyCache, hasMailExchanger } from "../src/verify.js";

const MODERN_PAGE = `<!doctype html><html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bouldin Creek Cafe</title>
  <meta name="description" content="Vegetarian cafe in South Austin">
</head><body><footer>&copy; 2026 Bouldin Creek</footer></body></html>`;

const NEGLECTED_PAGE = `<!doctype html><html><head>
  <title></title>
</head><body><footer>Copyright &copy; 2015 Old Diner</footer></body></html>`;

describe("isSocialOnly", () => {
  it("flags a Facebook page standing in for a website", () => {
    assert.equal(isSocialOnly("https://www.facebook.com/thecafe"), true);
    assert.equal(isSocialOnly("https://instagram.com/thecafe"), true);
    assert.equal(isSocialOnly("https://mycafe.business.site"), true);
  });

  it("leaves a real website alone", () => {
    assert.equal(isSocialOnly("https://bouldincreekcafe.com/"), false);
  });

  it("does not match a lookalike domain", () => {
    assert.equal(isSocialOnly("https://notfacebook.com.mycafe.io/"), false);
  });
});

describe("latestCopyrightYear", () => {
  it("reads a plain notice", () => {
    assert.equal(latestCopyrightYear("<p>&copy; 2019 Someone</p>"), 2019);
  });

  it("prefers the end of a range", () => {
    assert.equal(latestCopyrightYear("<p>Copyright © 2014-2023 Someone</p>"), 2023);
  });

  it("returns null when there is no notice", () => {
    assert.equal(latestCopyrightYear("<p>no year here</p>"), null);
  });

  it("ignores years that are not copyright notices", () => {
    assert.equal(latestCopyrightYear("<p>Established 1923. Open daily.</p>"), null);
  });
});

describe("detectBuilder", () => {
  it("spots common site builders", () => {
    assert.equal(detectBuilder('<script src="https://static.wixstatic.com/x.js">'), "Wix");
    assert.equal(detectBuilder('<link href="/wp-content/themes/x.css">'), "WordPress");
    assert.equal(detectBuilder("<div>hand written</div>"), null);
  });
});

describe("analyseSite", () => {
  it("gives a well-built site a low score", () => {
    const result = analyseSite({
      url: "https://bouldincreekcafe.com/",
      finalUrl: "https://bouldincreekcafe.com/",
      html: MODERN_PAGE,
      elapsedMs: 400,
      now: 2026,
    });
    assert.deepEqual(result.signals, []);
    assert.equal(result.score, 0);
    assert.equal(result.band, "low");
  });

  it("stacks up signals on a neglected site", () => {
    const result = analyseSite({
      url: "http://olddiner.com/",
      finalUrl: "http://olddiner.com/",
      html: NEGLECTED_PAGE,
      elapsedMs: 5000,
      now: 2026,
    });
    for (const expected of ["no_https", "no_viewport", "missing_title", "no_description", "stale_copyright", "slow"]) {
      assert.ok(result.signals.includes(expected), `missing ${expected}`);
    }
    assert.equal(result.band, "high");
  });

  it("treats an unreachable site as the strongest signal", () => {
    const result = analyseSite({ url: "https://gone.example/", reachable: false });
    assert.deepEqual(result.signals, ["unreachable"]);
    assert.equal(result.score, 40);
  });

  it("caps the score at 100", () => {
    const result = analyseSite({
      url: "http://facebook.com/x",
      finalUrl: "http://facebook.com/x",
      html: NEGLECTED_PAGE,
      elapsedMs: 9000,
      now: 2026,
    });
    assert.ok(result.score <= 100);
  });

  it("does not call a current copyright stale", () => {
    const result = analyseSite({ url: "https://x.com/", html: MODERN_PAGE, now: 2026 });
    assert.ok(!result.signals.includes("stale_copyright"));
  });
});

describe("hasMailExchanger", () => {
  it("returns true when the domain has MX records", async () => {
    clearVerifyCache();
    const ok = await hasMailExchanger("hi@example.test", { lookup: async () => [{ exchange: "mx.x", priority: 10 }] });
    assert.equal(ok, true);
  });

  it("returns false when the domain has none", async () => {
    clearVerifyCache();
    const ok = await hasMailExchanger("hi@nomail.test", { lookup: async () => [] });
    assert.equal(ok, false);
  });

  it("returns false for a domain that does not exist", async () => {
    clearVerifyCache();
    const ok = await hasMailExchanger("hi@missing.test", {
      lookup: async () => { const error = new Error("nope"); error.code = "ENOTFOUND"; throw error; },
    });
    assert.equal(ok, false);
  });

  it("returns null when the lookup itself fails", async () => {
    clearVerifyCache();
    const ok = await hasMailExchanger("hi@timeout.test", {
      lookup: async () => { const error = new Error("timeout"); error.code = "ETIMEOUT"; throw error; },
    });
    assert.equal(ok, null);
  });

  it("returns null for a malformed address", async () => {
    clearVerifyCache();
    assert.equal(await hasMailExchanger("not-an-email"), null);
  });
});
