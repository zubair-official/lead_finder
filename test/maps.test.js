import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cleanUrl, identityKey, isExternal, parseCardText } from "../src/maps.js";

const US_CARD = [
  "Blue Bottle Coffee",
  "4.5(1,234)",
  "Coffee shop · 300 Webster St",
  "Open ⋅ Closes 6 PM",
  "+1 510-653-3394",
].join("\n");

const UK_CARD = [
  "The Corner Cafe",
  "4,7(89)",
  "Cafe · 12 High Street",
  "Closes soon ⋅ 5 pm ⋅ 020 7946 0958",
].join("\n");

// What signed-out Maps actually renders: a bare rating, no review count, and a
// private-use icon glyph sitting in the middle of the address line.
const SIGNED_OUT_CARD = [
  "Terrible Love",
  "Terrible Love",
  "4.9",
  "Coffee shop ·  · 3908 Avenue B",
  "Closed · Opens 7:30 AM",
].join("\n");

const SPONSORED_CARD = [
  "Lana's Cafe",
  "Sponsored",
  "",
  "Lana's Cafe",
  "4.8",
  "American restaurant · 2620 Perseverance Drive",
  "Closed · Opens 8 AM",
].join("\n");

describe("parseCardText", () => {
  it("parses a US card", () => {
    const parsed = parseCardText(US_CARD);
    assert.equal(parsed.category, "Coffee shop");
    assert.equal(parsed.address, "300 Webster St");
    assert.equal(parsed.phone, "+1 510-653-3394");
    assert.equal(parsed.rating, "4.5");
    assert.equal(parsed.reviews, "1234");
  });

  it("parses a UK card with a comma rating and an inline phone", () => {
    const parsed = parseCardText(UK_CARD);
    assert.equal(parsed.category, "Cafe");
    assert.equal(parsed.address, "12 High Street");
    assert.equal(parsed.rating, "4.7");
    assert.equal(parsed.reviews, "89");
    assert.equal(parsed.phone, "020 7946 0958");
  });

  it("reads a bare rating and a clean address from a signed-out card", () => {
    const parsed = parseCardText(SIGNED_OUT_CARD);
    assert.equal(parsed.rating, "4.9");
    assert.equal(parsed.reviews, "");
    assert.equal(parsed.category, "Coffee shop");
    assert.equal(parsed.address, "3908 Avenue B");
  });

  it("never leaks icon glyphs into a field", () => {
    for (const value of Object.values(parseCardText(SIGNED_OUT_CARD))) {
      assert.ok(!value.includes(""), `glyph leaked into ${JSON.stringify(value)}`);
    }
  });

  it("does not treat a Sponsored label as the category", () => {
    const parsed = parseCardText(SPONSORED_CARD);
    assert.equal(parsed.category, "American restaurant");
    assert.equal(parsed.address, "2620 Perseverance Drive");
    assert.equal(parsed.rating, "4.8");
  });

  it("keeps hyphens in phone numbers", () => {
    assert.equal(parseCardText(US_CARD).phone, "+1 510-653-3394");
  });

  it("survives empty card text", () => {
    assert.deepEqual(parseCardText(""), {
      category: "", address: "", phone: "", rating: "", reviews: "",
    });
  });
});

describe("cleanUrl", () => {
  it("strips Google's listing tracking", () => {
    const dirty = "https://www.corner.com/?utm_source=google&utm_medium=organic&utm_campaign=business_listing";
    assert.equal(cleanUrl(dirty), "https://www.corner.com/");
  });

  it("keeps meaningful query parameters", () => {
    assert.equal(cleanUrl("https://shop.com/menu?lang=en&utm_source=google"), "https://shop.com/menu?lang=en");
  });

  it("leaves clean urls alone", () => {
    assert.equal(cleanUrl("https://bouldincreekcafe.com/"), "https://bouldincreekcafe.com/");
  });

  it("handles an empty url", () => {
    assert.equal(cleanUrl(""), "");
  });
});

describe("isExternal", () => {
  it("rejects Google's own links and accepts real sites", () => {
    assert.equal(isExternal("https://www.google.com/maps/place/x"), false);
    assert.equal(isExternal("https://bouldincreekcafe.com/"), true);
    assert.equal(isExternal("not a url"), false);
  });
});

describe("identityKey", () => {
  it("matches the same business listed twice under different hrefs", () => {
    const a = { name: "Cosmic Pickle", address: "121 Pickle Road" };
    const b = { name: "Cosmic  Pickle ", address: "121 Pickle Road" };
    assert.equal(identityKey(a), identityKey(b));
  });

  it("keeps two branches of one chain apart", () => {
    const congress = { name: "Bennu Coffee", address: "2001 E Congress" };
    const other = { name: "Bennu Coffee", address: "515 S Congress" };
    assert.notEqual(identityKey(congress), identityKey(other));
  });
});
