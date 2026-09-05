/**
 * Judge a business's website from the page we already downloaded.
 *
 * The email pass fetches each business's homepage anyway, so every signal here
 * is free — no extra requests. The point is to turn a list of businesses into a
 * ranked list of prospects: a café with no HTTPS, no mobile viewport and a 2017
 * copyright is a far better lead than one with a current, well-built site.
 *
 * Scores are opportunity, not quality: higher means more wrong with the site.
 */

// Hosts that mean "this business has no real website", not "this is their site".
const SOCIAL_HOSTS = [
  "facebook.com", "fb.com", "instagram.com", "linktr.ee", "linktree.com",
  "business.site", "sites.google.com", "wixsite.com", "blogspot.com",
  "wordpress.com", "weebly.com", "myshopify.com", "square.site", "tumblr.com",
  "yelp.com", "tripadvisor.com", "menufy.com", "toasttab.com",
];

// DIY builders: a real site, but usually a template someone outgrew.
const BUILDER_PATTERNS = [
  [/wix\.com|wixstatic|_wixCssImports/i, "Wix"],
  [/squarespace|static1\.squarespace\.com/i, "Squarespace"],
  [/godaddy|websitebuilder\.godaddy/i, "GoDaddy"],
  [/weebly|editmysite\.com/i, "Weebly"],
  [/shopify|cdn\.shopify\.com/i, "Shopify"],
  [/wp-content|wp-includes/i, "WordPress"],
  [/duda|dudaone|multiscreensite/i, "Duda"],
];

/**
 * Each signal is worth points toward the opportunity score.
 * Weights are deliberately coarse — this ranks leads, it doesn't grade sites.
 */
export const SIGNAL_WEIGHTS = {
  unreachable: 40,   // listed a website that doesn't load at all
  social_only: 35,   // a Facebook page standing in for a website
  no_https: 25,      // still on plain http in 2026
  no_viewport: 20,   // no mobile viewport - almost certainly not responsive
  missing_title: 10, // no <title>, so nothing useful in search results
  stale_copyright: 12,
  slow: 8,
  site_builder: 8,
  no_description: 5,
};

export const SIGNAL_LABELS = {
  unreachable: "site won't load",
  social_only: "social page only",
  no_https: "no HTTPS",
  no_viewport: "not mobile-ready",
  missing_title: "no page title",
  stale_copyright: "stale copyright",
  slow: "slow to load",
  site_builder: "site builder",
  no_description: "no meta description",
};

const COPYRIGHT_RE = /(?:©|&copy;|copyright)[^0-9]{0,20}(?:(\d{4})\s*[-–—]\s*)?(\d{4})/gi;

/** True when the listed "website" is really just a social or marketplace page. */
export function isSocialOnly(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return SOCIAL_HOSTS.some((social) => host === social || host.endsWith(`.${social}`));
  } catch {
    return false;
  }
}

/** The most recent year claimed in a copyright notice, or null. */
export function latestCopyrightYear(html) {
  let latest = null;
  for (const match of String(html ?? "").matchAll(COPYRIGHT_RE)) {
    // Prefer the range's end year ("© 2019-2024") over its start.
    const year = Number(match[2] ?? match[1]);
    if (Number.isInteger(year) && year >= 1990 && year <= 2100) {
      latest = latest === null ? year : Math.max(latest, year);
    }
  }
  return latest;
}

export function detectBuilder(html) {
  for (const [pattern, name] of BUILDER_PATTERNS) {
    if (pattern.test(html)) return name;
  }
  return null;
}

/**
 * Build the signal set for one business.
 *
 * @param {object} input
 * @param {string} input.url        the website URL as listed on Maps
 * @param {string} [input.finalUrl] where it ended up after redirects
 * @param {string} [input.html]     homepage markup, if we got any
 * @param {number} [input.elapsedMs]
 * @param {boolean} [input.reachable]
 * @param {number} [input.now]      current year, injectable for tests
 */
export function analyseSite({ url, finalUrl, html, elapsedMs = 0, reachable = true, now }) {
  const hits = {};
  const currentYear = now ?? new Date().getFullYear();
  const effectiveUrl = finalUrl || url || "";

  if (isSocialOnly(url) || isSocialOnly(effectiveUrl)) hits.social_only = true;

  if (!reachable) {
    hits.unreachable = true;
    return finalise(hits, { builder: null, copyrightYear: null });
  }

  if (effectiveUrl.startsWith("http://")) hits.no_https = true;

  const markup = String(html ?? "");
  if (markup) {
    if (!/<meta[^>]+name=["']?viewport/i.test(markup)) hits.no_viewport = true;

    const title = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(markup);
    if (!title || !title[1].trim()) hits.missing_title = true;

    if (!/<meta[^>]+name=["']?description/i.test(markup)) hits.no_description = true;

    const year = latestCopyrightYear(markup);
    // Two full years behind suggests nobody has touched the site.
    if (year !== null && year < currentYear - 2) hits.stale_copyright = true;

    if (detectBuilder(markup)) hits.site_builder = true;
  }

  if (elapsedMs > 3000) hits.slow = true;

  return finalise(hits, {
    builder: markup ? detectBuilder(markup) : null,
    copyrightYear: markup ? latestCopyrightYear(markup) : null,
  });
}

function finalise(hits, extra) {
  const list = Object.keys(hits).filter((key) => hits[key]);
  const score = Math.min(
    100,
    list.reduce((total, key) => total + (SIGNAL_WEIGHTS[key] ?? 0), 0),
  );
  return {
    signals: list,
    score,
    band: score >= 50 ? "high" : score >= 20 ? "medium" : "low",
    ...extra,
  };
}
