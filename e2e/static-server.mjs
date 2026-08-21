/** Tiny SPA static server for the Playwright E2E suite (CSR-only, no SSR). */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const DIST = new URL("../dist/web/browser", import.meta.url).pathname;
const PORT = Number(process.env["STATIC_PORT"] ?? 4300);

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const filePath = join(DIST, decodeURIComponent(url.pathname));
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    // outputMode "server" builds name the CSR fallback index.csr.html.
    const index = await readFile(join(DIST, "index.csr.html"));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(index);
  }
}).listen(PORT, () => {
  console.log(`[static] serving ${DIST} on http://localhost:${PORT}`);
});
