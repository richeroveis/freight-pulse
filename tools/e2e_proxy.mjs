// Same-origin dev proxy for the browser e2e run. Serves the built frontend and
// forwards the GenLayer JSON-RPC to studionet server-side, so the page never
// makes a cross-origin call. That removes the browser CORS failures the studio
// API triggers when it rate limits (error responses omit CORS headers), and lets
// this proxy retry those calls with backoff. Used only for the automated run;
// the committed app config still points directly at studio.genlayer.com.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const UPSTREAM = process.env.UPSTREAM_RPC || "https://studio.genlayer.com/api";
const PORT = Number(process.env.PROXY_PORT || 4178);
const DIST = resolve(import.meta.dirname, "../frontend/dist");
const BASE = "/freight-pulse";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function forwardRpc(body) {
  let lastError = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const res = await fetch(UPSTREAM, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
      });
      // 5xx and 429 mean the network is limiting; retry with backoff instead of
      // surfacing a body the browser would only see as a blocked cross-origin call.
      if (res.status >= 500 || res.status === 429) {
        lastError = new Error("upstream " + res.status);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      const text = await res.text();
      return { status: res.status, text };
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError || new Error("upstream failed");
}

async function serveStatic(pathname, res) {
  let rel = pathname;
  if (rel.startsWith(BASE)) rel = rel.slice(BASE.length);
  if (rel === "" || rel === "/") rel = "/index.html";
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST, safe);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    /* fall through to SPA index */
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    // SPA fallback so client-side routes resolve.
    try {
      const index = await readFile(join(DIST, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }
}

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (req.method === "POST" && (pathname === "/api" || pathname === BASE + "/api")) {
      const body = await readBody(req);
      const { status, text } = await forwardRpc(body);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(text);
      return;
    }
    await serveStatic(pathname, res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("proxy error " + String(error && error.message));
  }
});

server.listen(PORT, () => {
  console.log("E2E_PROXY listening on http://localhost:" + PORT + BASE + "/ -> " + UPSTREAM);
});
