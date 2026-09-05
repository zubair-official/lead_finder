/**
 * Find a contact email on a business's own website.
 *
 * This module never touches Google. It only fetches the site a business listed
 * on its own Maps profile, one page at a time, honouring robots.txt.
 */

import * as cheerio from "cheerio";
import robotsParser from "robots-parser";

import { config } from "./config.js";
import { analyseSite, isSocialOnly } from "./signals.js";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 lead-finder/1.0";

/** Tried in order; we stop at the first page that yields an email. */
export const CONTACT_PATHS = ["/", "/contact", "/contact-us", "/about", "/contact.html", "/about-us"];

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,24}/g;

// Strings that match EMAIL_RE but are never a contact address: retina asset
// filenames (logo@2x.png), error-tracker/CMS keys, and the placeholder
// addresses that themes ship with.
const ASSET_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".css", ".js", ".woff", ".woff2"];
const JUNK_DOMAINS = new Set([
  "sentry.io", "sentry-cdn.com", "wixpress.com", "example.com", "example.org",
  "domain.com", "yourdomain.com", "email.com", "yoursite.com", "sentry.wixpress.com",
  "godaddy.com", "squarespace.com", "test.com", "company.com", "mysite.com",
]);
const JUNK_LOCAL_PARTS = new Set(["you", "your", "email", "someone", "user", "name", "username", "example"]);
// Retina/density suffixes: the "local part" of logo@2x.png is "logo".
const DENSITY_RE = /^[123](?:\.[05])?x$/i;

/** Trim punctuation and casing noise off a regex hit. */
export function cleanCandidate(raw) {
  return String(raw ?? "").trim().replace(/^[.,;:()<>[\]'"]+|[.,;:()<>[\]'"]+$/g, "").toLowerCase();
}

/** Reject the well-known false positives that look like addresses. */
export function isPlausibleEmail(candidate) {
  if ((candidate.match(/@/g) ?? []).length !== 1) return false;
  const [local, domain] = candidate.split("@");
  if (!local || !domain || candidate.includes("..")) return false;
  if (ASSET_EXTENSIONS.some((extension) => domain.endsWith(extension))) return false;
  if (DENSITY_RE.test(domain.split(".")[0])) return false;
  if (JUNK_DOMAINS.has(domain)) return false;
  if ([...JUNK_DOMAINS].some((junk) => domain.endsWith(`.${junk}`))) return false;
  if (JUNK_LOCAL_PARTS.has(local)) return false;
  // A bare hex blob local part is almost always a tracking key, not a person.
  if (local.length >= 24 && /^[0-9a-f]+$/.test(local)) return false;
  return true;
}

/**
 * Return plausible emails from a page, best candidate first.
 *
 * mailto: links outrank loose matches, and an address on the site's own domain
 * outranks a web designer's address in the footer.
 */
export function extractEmails(html, siteDomain = "") {
  const $ = cheerio.load(html);
  const ranked = new Map();

  const consider = (raw, bonus) => {
    const candidate = cleanCandidate(raw);
    // Re-test as a whole string: EMAIL_RE is global, so reset it each time.
    if (!new RegExp(`^${EMAIL_RE.source}$`).test(candidate)) return;
    if (!isPlausibleEmail(candidate)) return;
    let score = bonus;
    if (siteDomain && candidate.endsWith(`@${siteDomain}`)) score += 10;
    ranked.set(candidate, Math.max(ranked.get(candidate) ?? 0, score));
  };

  $("a[href]").each((_, element) => {
    const href = String($(element).attr("href") ?? "").trim();
    if (href.toLowerCase().startsWith("mailto:")) {
      consider(href.slice("mailto:".length).split("?")[0], 5);
    }
  });

  // Scanning the raw markup (not just visible text) also picks up addresses
  // parked in JSON-LD blocks, which is where a lot of sites keep the real one.
  for (const match of html.matchAll(EMAIL_RE)) consider(match[0], 0);

  return [...ranked.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([email]) => email);
}

export function baseDomain(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

/** Fetches business websites politely: robots.txt respected, one page at a time. */
export class SiteFetcher {
  constructor({ timeout = config.emailTimeoutMs } = {}) {
    this.timeout = timeout;
    this.robotsCache = new Map();
  }

  async #get(url) {
    return fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(this.timeout),
    });
  }

  async #robotsFor(url) {
    const { origin } = new URL(url);
    if (!this.robotsCache.has(origin)) {
      let parser = null;
      try {
        const response = await this.#get(`${origin}/robots.txt`);
        // No usable robots.txt: default to allowed, same as any crawler would.
        if (response.ok) parser = robotsParser(`${origin}/robots.txt`, await response.text());
      } catch {
        parser = null;
      }
      this.robotsCache.set(origin, parser);
    }
    return this.robotsCache.get(origin);
  }

  async mayFetch(url) {
    if (!config.respectRobots) return true;
    const parser = await this.#robotsFor(url);
    if (!parser) return true;
    return parser.isAllowed(url, USER_AGENT) !== false;
  }

  /**
   * Visit a business's site once and report everything we learn from it.
   *
   * The homepage is fetched first and kept: it answers both "is there an email
   * here" and "what shape is this site in", so the quality signals cost nothing
   * beyond the request the email lookup was already making.
   *
   * @returns {Promise<{email: string|null, source: string|null, analysis: object|null}>}
   */
  async inspect(website) {
    if (!website) return { email: null, source: null, analysis: null };

    let target = website;
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    const domain = baseDomain(target);

    // A Facebook page is not a website: fetching it teaches us nothing, and
    // Facebook does not want to be crawled.
    if (isSocialOnly(target)) {
      return { email: null, source: null, analysis: analyseSite({ url: target, reachable: true }) };
    }

    let analysis = null;
    let email = null;
    let source = null;

    for (const contactPath of CONTACT_PATHS) {
      let url;
      try {
        url = new URL(contactPath, target).href;
      } catch {
        continue;
      }
      if (!(await this.mayFetch(url))) continue;

      const startedAt = Date.now();
      let response;
      try {
        response = await this.#get(url);
      } catch {
        // Timeout, DNS failure, bad certificate. A homepage that will not load
        // is itself the strongest signal there is.
        if (contactPath === "/") analysis = analyseSite({ url: target, reachable: false });
        continue;
      }

      const isHtml = (response.headers.get("content-type") ?? "").toLowerCase().includes("html");
      if (!response.ok || !isHtml) {
        if (contactPath === "/" && !analysis) {
          analysis = analyseSite({ url: target, finalUrl: response.url, reachable: response.ok });
        }
        continue;
      }

      const html = await response.text();
      if (contactPath === "/" || !analysis) {
        analysis = analyseSite({
          url: target,
          finalUrl: response.url,
          html,
          elapsedMs: Date.now() - startedAt,
          reachable: true,
        });
      }

      if (!email) {
        const found = extractEmails(html, domain);
        if (found.length) {
          email = found[0];
          source = url;
          break; // the site is already analysed; nothing left to learn
        }
      }
    }

    return { email, source, analysis };
  }

  /** Kept for callers that only want the address. */
  async findEmail(website) {
    const { email, source } = await this.inspect(website);
    return { email, source };
  }
}
