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
});
