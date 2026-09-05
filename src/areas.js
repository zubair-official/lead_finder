/**
 * Split a city field into separate searches.
 *
 * Google caps a single query at roughly 120 listings however hard you scroll,
 * so covering a city means several smaller searches rather than one big one:
 * "Gulberg Lahore, DHA Lahore, Model Town Lahore" becomes three runs whose
 * results are merged and deduplicated.
 */
export function parseAreas(city) {
  const seen = new Set();
  const areas = [];
  for (const part of String(city ?? "").split(",")) {
    const area = part.trim().replace(/\s+/g, " ");
    if (!area) continue;
    const key = area.toLowerCase();
    if (seen.has(key)) continue; // the same area typed twice is one search
    seen.add(key);
    areas.push(area);
  }
  return areas;
}
