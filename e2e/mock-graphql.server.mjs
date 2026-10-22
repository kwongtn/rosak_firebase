/**
 * Minimal GraphQL mock server for the Playwright E2E suite.
 *
 * The CSR bundle is built with the development configuration, so its GraphQL
 * client targets the local dev backend (http://localhost:8000/graphql/) — a
 * server the E2E stack never runs. `routeGraphQLToMock`
 * (e2e/helpers/mock-graphql.ts) forwards every GraphQL request the page makes
 * to this server instead, which answers over the real HTTP wire format.
 *
 * Handlers are keyed by the operation name parsed out of the query text and
 * configured via POST /__configure. The home page's specs use FrontPageLines,
 * Feed, SubmitFeedLink, SubmitLineStatusReport, UpvoteSocialMediaLink,
 * StationLinesByLine and the three lazy line-card reads LineStatusHistory,
 * LineStatusWeekProfile and LineStatusReports; the operation-agnostic dispatch means adding a new one is
 * a spec-side concern, not a change here.
 *
 * Dispatch is deliberately variable-agnostic: whatever `variables` the page
 * sends (the Feed read's `currentServiceDayOnly` service-day scoping and its
 * `after` cursor included) are recorded verbatim and the configured stub is
 * replayed as-is. Contract additions — the feed connection's `totalCount`, a
 * report's `stations { id displayName }`, the vote fields — are therefore
 * spec-side stub data, not server code; this file only has to not choke on the
 * new variables, which the pass-through already guarantees.
 *
 * Two things fail loudly instead of passing for the wrong reason:
 *   - an operation with no configured stub answers a GraphQL error AND its name is recorded
 *     (GET /__unstubbed), which the shared `test` in helpers/mock-graphql.ts turns into a test
 *     failure after every test;
 *   - a mutation sent without the `firebase-auth-key` header answers an UNAUTHENTICATED error, as
 *     the real backend does, so a spec cannot "log in" without the token path really running.
 *
 * Endpoints:
 *   POST /graphql/        answered from the configured operation stubs
 *   POST /__configure     body: { [operationName]: responseData | { __error: message } }
 *   GET  /__calls         every received GraphQL call (name, variables, authKey), oldest first
 *   GET  /__unstubbed     names of the operations received without a stub, first seen first
 *   POST /__reset         clears stubs, recorded calls and unstubbed names
 */
import { createServer } from "node:http";

const PORT = Number(process.env["MOCK_GRAPHQL_PORT"] ?? 4301);

let stubs = {};
const calls = [];
const unstubbed = [];

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
    unstubbed.length = 0;
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

  if (req.method === "GET" && req.url === "/__unstubbed") {
    json(res, 200, unstubbed);
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
      const authKey = req.headers["firebase-auth-key"] ?? null;
      calls.push({ operationName: name, variables: body.variables ?? {}, authKey });
      if (/^\s*mutation\b/.test(body.query ?? "") && !authKey) {
        json(res, 200, {
          errors: [
            {
              message: `${name} sent without firebase-auth-key`,
              extensions: { code: "UNAUTHENTICATED" },
            },
          ],
        });
        return;
      }
      if (!(name in stubs)) {
        if (!unstubbed.includes(name)) {
          unstubbed.push(name);
        }
        json(res, 200, { errors: [{ message: `No stub configured for ${name}` }] });
        return;
      }
      // The stub value IS the GraphQL `data` object (keyed by root field name), unless it is the
      // `{ __error: message }` marker (see graphqlError in helpers/mock-graphql.ts): then the
      // operation fails the way a rejected request does, with a top-level `errors` array.
      if (typeof stubs[name]?.__error === "string") {
        json(res, 200, { errors: [{ message: stubs[name].__error }] });
        return;
      }
      json(res, 200, { data: stubs[name] });
    });
    return;
  }

  json(res, 404, { message: `Unhandled ${req.method} ${req.url}` });
});

server.listen(PORT, () => {
  console.log(`[mock-graphql] listening on http://localhost:${PORT}`);
});
