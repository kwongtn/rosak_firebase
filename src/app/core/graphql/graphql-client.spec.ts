import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GraphQLClient, graphqlResource } from "./graphql-client";

interface LinesData {
  lines: { id: string }[];
}

const query = "query { lines { id } }";

describe("graphql-client", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function createResource(options?: { retainDataIfEqual?: boolean }) {
    return TestBed.runInInjectionContext(() =>
      graphqlResource<LinesData>(() => ({ query }), options),
    );
  }

  function expectRequest() {
    return httpMock.expectOne(
      (request) => request.method === "POST" && request.body.query === query,
    );
  }

  function expectRequestFor(lineId: string) {
    return httpMock.expectOne(
      (request) => request.method === "POST" && request.body.variables?.lineId === lineId,
    );
  }

  const serverError = { status: 500, statusText: "Server Error" };

  /** Resolves a first request, then fails the refresh of it, and lets the resource settle. */
  async function loadThenFailRefresh(resource: ReturnType<typeof createResource>) {
    TestBed.tick();
    expectRequest().flush({ data: { lines: [{ id: "1" }] } });
    await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "1" }] }));
    TestBed.tick();

    resource.reload();
    TestBed.tick();
    expectRequest().flush({ message: "boom" }, serverError);
    await vi.waitFor(() => expect(resource.transportError()).toBeDefined());
    TestBed.tick();
  }

  it("retains the previous data reference when a refresh is deeply equal", async () => {
    const resource = createResource();
    TestBed.tick();

    expectRequest().flush({ data: { lines: [{ id: "1" }] } });
    await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "1" }] }));
    TestBed.tick();

    const first = resource.data();
    expect(first).toBeDefined();
    expect(resource.isLoading()).toBe(false);

    resource.reload();
    TestBed.tick();
    expectRequest().flush({ data: { lines: [{ id: "1" }] } });
    await vi.waitFor(() => expect(resource.data()).toBe(first));

    expect(resource.data()).toBe(first);
    expect(resource.isLoading()).toBe(false);
  });

  it("replaces the data reference when a refresh contains a different payload", async () => {
    const resource = createResource();
    TestBed.tick();

    expectRequest().flush({ data: { lines: [{ id: "1" }] } });
    await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "1" }] }));
    TestBed.tick();

    const first = resource.data();
    expect(first).toBeDefined();

    resource.reload();
    TestBed.tick();
    expectRequest().flush({ data: { lines: [{ id: "2" }] } });
    await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "2" }] }));

    expect(resource.data()).not.toBe(first);
    expect(resource.data()).toEqual({ lines: [{ id: "2" }] });
  });

  it("replaces equal responses when retention is explicitly disabled", async () => {
    const resource = createResource({ retainDataIfEqual: false });
    TestBed.tick();

    expectRequest().flush({ data: { lines: [{ id: "1" }] } });
    await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "1" }] }));
    TestBed.tick();

    const first = resource.data();
    expect(first).toBeDefined();

    resource.reload();
    TestBed.tick();
    expectRequest().flush({ data: { lines: [{ id: "1" }] } });
    await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "1" }] }));

    expect(resource.data()).not.toBe(first);
  });

  it("exposes isFetching for a reload that isLoading deliberately hides", async () => {
    // The trap this member exists for: `isLoading` is pristine-first-fetch-only, so once the first
    // load has settled it can never be observed again — a caller that wants to know "did that manual
    // refresh finish?" has nothing to watch, and a plain `_pending` boolean can never re-trigger an
    // effect keyed on `isLoading`. `isFetching` is the raw in-flight flag, true while any request is on
    // the wire — the first fetch, a `reload()`, a retry ATTEMPT — and false during the backoff WAIT
    // between attempts (the case below pins that boundary, because "a retry is running" is not the
    // same claim as "a request is in flight").
    const resource = createResource();
    TestBed.tick();
    expect(resource.isFetching()).toBe(true);

    expectRequest().flush({ data: { lines: [{ id: "1" }] } });
    await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "1" }] }));
    TestBed.tick();

    expect(resource.isFetching()).toBe(false);
    expect(resource.isLoading()).toBe(false);

    resource.reload();
    TestBed.tick();
    expect(resource.isFetching()).toBe(true);
    // The pair that makes the distinction legible: same request, opposite answers.
    expect(resource.isLoading()).toBe(false);

    expectRequest().flush({ data: { lines: [{ id: "1" }] } });
    await vi.waitFor(() => expect(resource.isFetching()).toBe(false));
    expect(resource.isFetching()).toBe(false);
  });

  it("reports isFetching false during the retry backoff, true again once retryNow fires", async () => {
    // The boundary `isFetching`'s doc comment now states: the exponential-backoff wait between two
    // attempts is NOT a request, so the flag is false there even though the retry machinery is
    // running. A caller that drove a spinner off `isFetching` therefore gets an honest "nothing on
    // the wire" instead of a spinner that stalls for 5s — and `hasError` stays true across the wait,
    // which is the signal a caller should show instead.
    const resource = createResource();
    TestBed.tick();
    expectRequest().flush({ message: "boom" }, { status: 500, statusText: "Server Error" });
    // `hasError` is set from an effect, so it needs a turn of the scheduler to land.
    await vi.waitFor(() => expect(resource.transportError()).toBeDefined());
    TestBed.tick();

    expect(resource.hasError()).toBe(true);
    expect(resource.retryCountdownSec()).not.toBeNull();
    expect(resource.isFetching()).toBe(false);
    // `isLoading` was already false here and would stay false through every retry — the pair is
    // what makes this a regression guard rather than a restatement of the pristine-fetch rule.
    expect(resource.isLoading()).toBe(false);

    resource.retryNow();
    TestBed.tick();
    expect(resource.isFetching()).toBe(true);
    expect(resource.retryCountdownSec()).toBeNull();

    expectRequest().flush({ data: { lines: [{ id: "1" }] } });
    await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "1" }] }));
    expect(resource.hasError()).toBe(false);
  });

  describe("error states", () => {
    // Angular's `httpResource().value()` THROWS while the request is in its error state, so a
    // plain computed over it threw inside every consumer on every failed poll.
    it("poll fails after success: data() does not throw and still returns the previous payload", async () => {
      const resource = createResource();
      await loadThenFailRefresh(resource);

      expect(resource.hasError()).toBe(true);
      expect(() => resource.data()).not.toThrow();
      expect(resource.data()).toEqual({ lines: [{ id: "1" }] });
    });

    it("errors() does not throw in the error state", async () => {
      const resource = createResource();
      TestBed.tick();
      expectRequest().flush({ message: "boom" }, serverError);
      await vi.waitFor(() => expect(resource.transportError()).toBeDefined());
      TestBed.tick();

      expect(() => resource.errors()).not.toThrow();
      expect(resource.errors()).toBeUndefined();
      // Nothing was ever loaded, so there is nothing to keep either.
      expect(() => resource.data()).not.toThrow();
      expect(resource.data()).toBeUndefined();
      expect(resource.hasError()).toBe(true);
    });

    it("variables change then failure: data() is undefined", async () => {
      // Several pages rely on `data()` going undefined when their request changes, so the kept
      // payload belongs to ONE request and must never be shown under another's variables.
      const lineId = signal("A");
      const resource = TestBed.runInInjectionContext(() =>
        graphqlResource<LinesData>(() => ({ query, variables: { lineId: lineId() } })),
      );
      TestBed.tick();
      expectRequestFor("A").flush({ data: { lines: [{ id: "A" }] } });
      await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "A" }] }));
      TestBed.tick();

      lineId.set("B");
      TestBed.tick();
      expect(resource.data()).toBeUndefined();

      expectRequestFor("B").flush({ message: "boom" }, serverError);
      await vi.waitFor(() => expect(resource.transportError()).toBeDefined());
      TestBed.tick();

      expect(() => resource.data()).not.toThrow();
      expect(resource.data()).toBeUndefined();
      expect(resource.hasError()).toBe(true);
    });

    it("drops the kept payload when the request is switched off", async () => {
      const enabled = signal(true);
      const resource = TestBed.runInInjectionContext(() =>
        graphqlResource<LinesData>(() => (enabled() ? { query } : undefined)),
      );
      TestBed.tick();
      expectRequest().flush({ data: { lines: [{ id: "1" }] } });
      await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "1" }] }));
      TestBed.tick();

      enabled.set(false);
      TestBed.tick();

      expect(resource.data()).toBeUndefined();
    });

    it("keys the kept payload on the request's content, not on the variables object's identity", async () => {
      // A recomputed-but-equal variables object re-issues the read (the underlying resource sees a
      // new request), yet it is still the SAME request, so the old answer stays up while it flies.
      const variables = signal({ lineId: "A" });
      const resource = TestBed.runInInjectionContext(() =>
        graphqlResource<LinesData>(() => ({ query, variables: variables() })),
      );
      TestBed.tick();
      expectRequestFor("A").flush({ data: { lines: [{ id: "A" }] } });
      await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "A" }] }));
      TestBed.tick();

      variables.set({ lineId: "A" });
      TestBed.tick();

      expect(resource.isFetching()).toBe(true);
      expect(resource.data()).toEqual({ lines: [{ id: "A" }] });
      expectRequestFor("A").flush({ data: { lines: [{ id: "A2" }] } });
      await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "A2" }] }));
    });

    it("keeps the previous payload while a retry after the failure is in flight", async () => {
      const resource = createResource();
      await loadThenFailRefresh(resource);

      resource.retryNow();
      TestBed.tick();

      // The underlying resource has no value at all here (reloading after an error).
      expect(resource.isFetching()).toBe(true);
      expect(() => resource.data()).not.toThrow();
      expect(resource.data()).toEqual({ lines: [{ id: "1" }] });
      expect(resource.hasError()).toBe(true);

      expectRequest().flush({ data: { lines: [{ id: "1" }] } });
      await vi.waitFor(() => expect(resource.hasError()).toBe(false));
    });

    it("recovers: new data replaces old after a successful retry", async () => {
      const resource = createResource();
      await loadThenFailRefresh(resource);

      resource.retryNow();
      TestBed.tick();
      expectRequest().flush({ data: { lines: [{ id: "2" }] } });

      await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "2" }] }));
      TestBed.tick();
      expect(resource.hasError()).toBe(false);
      expect(resource.retryCountdownSec()).toBeNull();
    });

    it("keeps the previous payload when a refresh answers with GraphQL errors and no data", async () => {
      const resource = createResource();
      TestBed.tick();
      expectRequest().flush({ data: { lines: [{ id: "1" }] } });
      await vi.waitFor(() => expect(resource.data()).toEqual({ lines: [{ id: "1" }] }));
      TestBed.tick();

      resource.reload();
      TestBed.tick();
      expectRequest().flush({ errors: [{ message: "boom" }] });
      await vi.waitFor(() => expect(resource.errors()).toEqual([{ message: "boom" }]));
      TestBed.tick();

      expect(resource.hasError()).toBe(true);
      expect(resource.data()).toEqual({ lines: [{ id: "1" }] });
    });
  });

  describe("GraphQLClient.request", () => {
    /** Sends one request through the client, answers it, and returns what went out. */
    async function send(headers?: Record<string, string>) {
      const sent = TestBed.inject(GraphQLClient).request<LinesData>(query, {}, headers);
      const call = httpMock.expectOne((r) => r.method === "POST" && r.body.query === query);
      call.flush({ data: { lines: [] } });
      await sent;
      return call.request;
    }

    it("sends the headers it is given", async () => {
      const sent = await send({ "firebase-auth-key": "tok-1" });

      expect(sent.headers.get("firebase-auth-key")).toBe("tok-1");
    });

    it("keeps a request that carries the viewer's token out of the SSR transfer cache", async () => {
      // The cache keys on method, URL and body, not headers, and answers from the server's render
      // until the app first settles: the server's answer to the same query is the anonymous one.
      const sent = await send({ "firebase-auth-key": "tok-1" });

      expect(sent.transferCache).toBe(false);
    });

    it("leaves every other request to the transfer cache, so a server-rendered read is not asked twice", async () => {
      expect((await send()).transferCache).toBeUndefined();
      expect((await send({})).transferCache).toBeUndefined();
      expect((await send({ "x-other": "1" })).transferCache).toBeUndefined();
    });
  });
});
