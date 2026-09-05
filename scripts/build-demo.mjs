/**
 * Build the static demo that gets deployed to Netlify.
 *
 * The demo is the real UI, unmodified. Rather than fork index.html, this
 * injects a shim that intercepts fetch() for the app's own endpoints and
 * answers them from a fixed sample dataset — so sorting, filtering, column
 * toggles, CSV/JSON export and the live row animations all run the same code
 * as production. Only the scraper is absent, because there is no server.
 *
 *   node scripts/build-demo.mjs
 *   DEMO_REPO_URL=https://github.com/you/lead-finder node scripts/build-demo.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CATEGORIES } from "../src/categories.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "dist");
const REPO_URL = process.env.DEMO_REPO_URL || "";

const BANNER_CSS = `
  .demo-banner {
    background: var(--blue); color: var(--white); font-size: 13.5px;
    padding: 9px 24px; text-align: center;
  }
  .demo-banner a { color: var(--white); text-decoration: underline; font-weight: 600; }
  .demo-banner strong { font-weight: 700; }
`;

const banner = () => `<div class="demo-banner">
  <strong>Live demo</strong> &mdash; sample data, fictional businesses. The scraper itself runs locally on your own machine${
    REPO_URL ? `, so grab the <a href="${REPO_URL}" target="_blank" rel="noopener">source on GitHub</a>` : ""
  }.
</div>`;

/** The fetch shim. Kept as a template string so it ships verbatim to the page. */
const shim = (data, categories) => `<script id="demo-data" type="application/json">${
  JSON.stringify(data).replace(/</g, "\\u003c")
}</script>
<script>
/* Demo mode: answer the app's own endpoints from the bundled dataset so the
   real UI runs unchanged. A search is simulated on a timeline, which is what
   makes the row-arrival and email-fill animations play exactly as they do
   against a live server. */
(() => {
  const DATA = JSON.parse(document.getElementById("demo-data").textContent);
  const CATEGORIES = ${JSON.stringify(categories)};
  const ROWS = DATA.results;

  const MAPS_START_MS = 1200;   // browser launch + first paint
  const ROW_MS = 240;           // one listing found
  const EMAIL_MS = 200;         // one site graded
  const mapsEnd = MAPS_START_MS + ROWS.length * ROW_MS;

  let startedAt = 0;
  let stopped = false;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  /** A listing as it looks before the email pass has reached it. */
  const beforeGrading = (row) => ({
    ...row, email: "", email_verified: null, score: null, signals: [], site_builder: "",
  });

  function snapshot() {
    const elapsed = Date.now() - startedAt;
    const found = Math.max(0, Math.min(ROWS.length, Math.floor((elapsed - MAPS_START_MS) / ROW_MS)));
    const graded = Math.max(0, Math.min(ROWS.length, Math.floor((elapsed - mapsEnd) / EMAIL_MS)));

    if (stopped) {
      const results = ROWS.slice(0, found).map(beforeGrading);
      return { state: "stopped", phase: "finished", message: \`Stopped. \${results.length} businesses kept.\`,
        needs_attention: false, count: results.length, results };
    }

    if (elapsed < MAPS_START_MS) {
      return { state: "running", phase: "maps",
        message: "Demo: replaying a saved sample run - your search terms are not used.",
        needs_attention: false, count: 0, results: [] };
    }

    if (found < ROWS.length) {
      const results = ROWS.slice(0, found).map(beforeGrading);
      return { state: "running", phase: "maps",
        message: \`Found \${results.length}: \${ROWS[Math.max(0, found - 1)].name}\`,
        needs_attention: false, count: results.length, results };
    }

    if (graded < ROWS.length) {
      const results = ROWS.map((row, index) => (index < graded ? row : beforeGrading(row)));
      let host = ROWS[graded].website.replace(/^https?:\\/\\//, "").split("/")[0];
      return { state: "running", phase: "emails",
        message: \`Checking \${host} (\${graded + 1}/\${ROWS.length})...\`,
        needs_attention: false, count: results.length, results };
    }

    const withEmail = ROWS.filter((row) => row.email).length;
    return { state: "done", phase: "finished",
      message: \`Sample run finished: \${ROWS.length} fictional businesses, \${withEmail} with an email. \` +
        "The real thing runs locally against Google Maps.",
      needs_attention: false, count: ROWS.length, results: ROWS };
  }

  const PAST_RUNS = [{
    id: "demo0000cafe", city: DATA.city, category: DATA.category,
    createdAt: new Date(Date.now() - 864e5).toISOString(), state: "done",
    count: ROWS.length, withEmail: ROWS.filter((r) => r.email).length,
  }];

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(input && input.url ? input.url : input);
    // Resolve against the page so this works on any origin, file:// included.
    let route;
    try { route = new URL(url, location.href).pathname; } catch { route = url.split("?")[0]; }

    if (route === "/api/config") {
      return json({ categories: CATEGORIES, maxResults: 40, headless: true, lookupEmails: true });
    }
    if (route === "/api/runs") return json({ runs: PAST_RUNS });
    if (route.startsWith("/api/runs/")) {
      return json({ id: route.split("/").pop(), count: ROWS.length, results: ROWS });
    }
    if (route === "/search") {
      startedAt = Date.now();
      stopped = false;
      return json({ job_id: "demo-job" });
    }
    if (route.startsWith("/status/")) return json(snapshot());
    if (route.startsWith("/stop/")) { stopped = true; return json({ ok: true }); }
    if (route === "/healthz") return json({ status: "ok", demo: true });

    return realFetch(input, init);
  };
})();
</script>
`;

async function main() {
  const html = await readFile(path.join(ROOT, "public", "index.html"), "utf8");
  const data = JSON.parse(await readFile(path.join(ROOT, "demo", "sample-data.json"), "utf8"));

  const appScript = "<script>\nconst el = (id) => document.getElementById(id);";
  if (!html.includes(appScript)) throw new Error("Could not find the app script tag in public/index.html");
  if (!html.includes("<body>")) throw new Error("Could not find <body> in public/index.html");

  let out = html
    .replace("</style>", `${BANNER_CSS}</style>`)
    .replace("<body>", `<body>\n${banner()}`)
    .replace(appScript, `${shim(data, CATEGORIES)}${appScript}`)
    .replace("<title>Lead Finder</title>", "<title>Lead Finder — demo</title>");

  // The demo has no server and no disk, so don't claim otherwise.
  out = out.replace(
    "Capped at <span id=\"maxResults\">40</span>.",
    "Capped at <span id=\"maxResults\">40</span>. This demo replays a saved run.",
  );
  out = out.replace("saved on disk in <code>runs/</code>", "one sample run");

  // The demo ignores whatever is typed, so don't present a live search box.
  out = out.replace(
    /<p class="hint">[\s\S]*?<\/p>/,
    '<p class="hint">Demo only &mdash; the sample run is replayed whatever you type here.</p>',
  );
  out = out.replace(
    'placeholder="Lahore &mdash; or Gulberg Lahore, DHA Lahore"',
    'placeholder="Riverton (sample)" value="Riverton" readonly',
  );
  out = out.replace(">Search<", ">Replay sample run<");
  out = out.replace(
    "Scrolls the results panel for each area you list, pausing between actions.",
    "Scrolls the results panel for each area you list, pausing between actions. (Simulated here.)",
  );

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "index.html"), out, "utf8");

  // Long-cache the assets, never the HTML.
  await writeFile(
    path.join(OUT_DIR, "_headers"),
    "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n\n/index.html\n  Cache-Control: public, max-age=0, must-revalidate\n",
    "utf8",
  );

  const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
  console.log(`dist/index.html  ${kb} KB  (${data.results.length} sample businesses)`);
  if (!REPO_URL) console.log("Tip: set DEMO_REPO_URL to add a GitHub link to the demo banner.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
