import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cleanCandidate, extractEmails, isPlausibleEmail } from "../src/emails.js";

describe("extractEmails", () => {
  it("finds a plain text email", () => {
    const html = "<html><body><p>Reach us at hello@bluebird.co.uk anytime.</p></body></html>";
    assert.deepEqual(extractEmails(html), ["hello@bluebird.co.uk"]);
  });

  it("ranks a mailto link above body text", () => {
    const html = `
      <a href="mailto:bookings@bluebird.co.uk?subject=Table">Book</a>
      <p>Press enquiries: press@bluebird.co.uk</p>`;
    assert.equal(extractEmails(html)[0], "bookings@bluebird.co.uk");
  });

  it("handles an uppercase MAILTO scheme", () => {
    assert.deepEqual(extractEmails('<a href="MAILTO:Info@Bluebird.co.uk">Mail</a>'), ["info@bluebird.co.uk"]);
  });

  it("prefers the business's own domain over a third party", () => {
    const html = `
      <p>info@bluebird.co.uk</p>
      <footer>site by webdev.agency &mdash; hello@webdev.agency</footer>`;
    assert.equal(extractEmails(html, "bluebird.co.uk")[0], "info@bluebird.co.uk");
  });

  it("does not mistake retina asset filenames for emails", () => {
    assert.deepEqual(extractEmails('<img src="/img/logo@2x.png"><img srcset="banner@3x.jpg 3x">'), []);
  });

  it("drops tracker and placeholder noise", () => {
    const html = `
      <script>Sentry.init({dsn:"https://abc@o12345.ingest.sentry.io/42"})</script>
      <p>you@example.com</p><p>name@yourdomain.com</p>`;
    assert.deepEqual(extractEmails(html), []);
  });

  it("ignores duplicates across the page", () => {
    const html = "<p>info@x.com</p><a href='mailto:info@x.com'>mail</a><p>info@x.com</p>";
    assert.deepEqual(extractEmails(html), ["info@x.com"]);
  });

  it("reads an address out of a JSON-LD block", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Restaurant","email":"eat@corner.test","name":"Corner"}</script>`;
    assert.deepEqual(extractEmails(html), ["eat@corner.test"]);
  });
});

describe("isPlausibleEmail", () => {
  it("drops a long hex local part", () => {
    assert.equal(isPlausibleEmail("0f1e2d3c4b5a69788796a5b4@analytics.io"), false);
  });

  it("keeps real addresses", () => {
    for (const address of ["info@cafe-nero.com", "jane.doe+leads@studio.io", "hi@a.co"]) {
      assert.equal(isPlausibleEmail(address), true, address);
    }
  });
});

describe("cleanCandidate", () => {
  it("strips surrounding punctuation and lowercases", () => {
    assert.equal(cleanCandidate('(Info@Bluebird.CO.UK),'), "info@bluebird.co.uk");
  });
});
