/**
 * Minimal GraphQL mock server for the Playwright E2E suite.
 *
 * The Angular app is SSR — its first data fetch happens in Node inside the
 * dev server, where browser-level request interception cannot reach. Pointing
 * BACKEND_GRAPHQL_URL at this server instead gives both the SSR pass and the
 * browser one deterministic responses over the real HTTP wire format.
 *
 * Endpoints:
 *   POST /graphql/        answered from the configured operation stubs
 *   POST /__configure     body: { [operationName]: responseData }
 *   GET  /__calls         every received GraphQL call, oldest first
 *   POST /__reset         clears stubs and recorded calls
 */
import { createServer } from "node:http";

const PORT = Number(process.env["MOCK_GRAPHQL_PORT"] ?? 4301);

let stubs = {};
const calls = [];

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,firebase-auth-key",
  });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  console.log(`[mock-graphql] ${new Date().toISOString()} ${req.method} ${req.url}`);
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  if (req.method === "POST" && req.url === "/__configure") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      stubs = JSON.parse(raw);
      json(res, 200, { ok: true });
    });
    return;
  }

  if (req.method === "POST" && req.url === "/__reset") {
    stubs = {};
    calls.length = 0;
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    json(res, 200, { ok: true, server: "mock-graphql" });
    return;
  }

  if (req.method === "GET" && req.url === "/__calls") {
    json(res, 200, calls);
    return;
  }

  if (req.method === "POST" && req.url?.startsWith("/graphql")) {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw);
      // Angular's httpResource posts {query, variables} — no operationName
      // field — so pull it out of the document itself.
      const match = /(?:query|mutation)\s+([A-Za-z0-9_]+)/.exec(body.query ?? "");
      const name = body.operationName ?? match?.[1] ?? "";
      calls.push({ operationName: name, variables: body.variables ?? {} });
      if (!(name in stubs)) {
        json(res, 200, { errors: [{ message: `No stub configured for ${name}` }] });
        return;
      }
      // The stub value IS the GraphQL `data` object (keyed by root field name).
      json(res, 200, { data: stubs[name] });
    });
    return;
  }

  json(res, 404, { message: `Unhandled ${req.method} ${req.url}` });
});

server.listen(PORT, () => {
  console.log(`[mock-graphql] listening on http://localhost:${PORT}`);
});
