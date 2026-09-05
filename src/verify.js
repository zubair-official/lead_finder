/**
 * Check that an email domain can actually receive mail.
 *
 * A DNS MX lookup is not proof the mailbox exists, but it cheaply catches the
 * common case: an address scraped off a site whose mail was never configured,
 * or a typo'd domain. Results are cached per domain — a run usually contains
 * several addresses at the same host.
 */

import { resolveMx } from "node:dns/promises";

const cache = new Map();

/** @returns {Promise<boolean|null>} true/false, or null if the check failed. */
export async function hasMailExchanger(email, { lookup = resolveMx } = {}) {
  const domain = String(email ?? "").split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  if (cache.has(domain)) return cache.get(domain);

  let verdict;
  try {
    const records = await lookup(domain);
    verdict = Array.isArray(records) && records.length > 0;
  } catch (error) {
    // ENOTFOUND / ENODATA are real answers: the domain has no mail exchanger.
    verdict = ["ENOTFOUND", "ENODATA", "NXDOMAIN"].includes(error?.code) ? false : null;
  }
  cache.set(domain, verdict);
  return verdict;
}

/** Exposed for tests. */
export function clearVerifyCache() {
  cache.clear();
}
