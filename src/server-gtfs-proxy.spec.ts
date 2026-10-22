import type { Request, Response as ExpressResponse } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  createGtfsProxyHandler,
  GTFS_PROXY_CACHE_CONTROL,
  GTFS_UPSTREAM_TIMEOUT_MS,
  type FetchLike,
} from "./server-gtfs-proxy";

const ALLOWED_URL = "https://api.data.gov.my/gtfs-static/stops.zip";

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status(code: number): FakeResponse;
  setHeader(name: string, value: string): FakeResponse;
  send(body: unknown): FakeResponse;
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    send(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function run(fetch: FetchLike, url: string | undefined, captureException = vi.fn()) {
  const handler = createGtfsProxyHandler({ fetch, captureException });
  const req = { query: url === undefined ? {} : { url } } as unknown as Request;
  const res = fakeResponse();
  return handler(req, res as unknown as ExpressResponse).then(() => ({ res, captureException }));
}

describe("createGtfsProxyHandler", () => {
  it("streams an upstream ok body with its content type and the cache header", async () => {
    const fetch = vi.fn<FetchLike>(
      async () => new Response("zipbytes", { headers: { "content-type": "application/zip" } }),
    );

    const { res, captureException } = await run(fetch, ALLOWED_URL);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0].href).toBe(ALLOWED_URL);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["cache-control"]).toBe(GTFS_PROXY_CACHE_CONTROL);
    expect(Buffer.from(res.body as Buffer).toString()).toBe("zipbytes");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("falls back to application/octet-stream when upstream sends no content type", async () => {
    const fetch = vi.fn<FetchLike>(async () => new Response(new Uint8Array([1, 2])));

    const { res } = await run(fetch, ALLOWED_URL);

    expect(res.headers["content-type"]).toBe("application/octet-stream");
  });

  it("passes the upstream status through on non-2xx without a cache header", async () => {
    const fetch = vi.fn<FetchLike>(
      async () => new Response("down", { status: 503, statusText: "Unavailable" }),
    );

    const { res, captureException } = await run(fetch, ALLOWED_URL);

    expect(res.statusCode).toBe(503);
    expect(res.body).toBe("Upstream error: 503 Unavailable");
    expect(res.headers["cache-control"]).toBeUndefined();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("answers 502 and reports to Sentry when the upstream fetch throws", async () => {
    const boom = new Error("socket hang up");
    const fetch = vi.fn<FetchLike>(async () => {
      throw boom;
    });

    const { res, captureException } = await run(fetch, ALLOWED_URL);

    expect(res.statusCode).toBe(502);
    expect(res.body).toBe("Proxy fetch failed: socket hang up");
    expect(captureException).toHaveBeenCalledWith(boom);
  });

  it("bounds the upstream fetch with AbortSignal.timeout(GTFS_UPSTREAM_TIMEOUT_MS)", async () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    const fetch = vi.fn<FetchLike>(async () => {
      throw timeout;
    });
    const spy = vi.spyOn(AbortSignal, "timeout");
    try {
      const { res, captureException } = await run(fetch, ALLOWED_URL);

      expect(spy).toHaveBeenCalledWith(GTFS_UPSTREAM_TIMEOUT_MS);
      expect(fetch.mock.calls[0]?.[1].signal).toBe(spy.mock.results[0]?.value);
      expect(res.statusCode).toBe(502);
      expect(captureException).toHaveBeenCalledWith(timeout);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects a missing url with 400 without fetching", async () => {
    const fetch = vi.fn<FetchLike>();

    const { res } = await run(fetch, undefined);

    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an unparseable url with 400 without fetching", async () => {
    const fetch = vi.fn<FetchLike>();

    const { res } = await run(fetch, "not a url");

    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["a different host", "https://example.com/stops.zip"],
    ["a lookalike suffix host", "https://api.data.gov.my.evil.example/stops.zip"],
    ["a userinfo trick", "https://api.data.gov.my@evil.example/stops.zip"],
  ])("rejects %s with 400 without fetching", async (_label, url) => {
    const fetch = vi.fn<FetchLike>();

    const { res } = await run(fetch, url);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe("URL host not allowed");
    expect(fetch).not.toHaveBeenCalled();
  });
});
