/** Tiny static server for previewing dist/ locally: node scripts/serve-demo.mjs */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".css": "text/css", ".js": "text/javascript" };
const port = Number(process.env.PORT || 5050);

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  const file = path.join(DIST, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  try {
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`demo preview on http://127.0.0.1:${port}`));
