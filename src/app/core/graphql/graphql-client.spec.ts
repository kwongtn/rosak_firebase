import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { graphqlResource } from "./graphql-client";

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
});
