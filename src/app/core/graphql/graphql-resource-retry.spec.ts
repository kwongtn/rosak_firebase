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

/** The retry schedule of `graphqlResource`: 5 s, doubling, capped at 3 minutes. */
describe("graphqlResource retry schedule", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
  });

  function create() {
    const resource = TestBed.runInInjectionContext(() =>
      graphqlResource<LinesData>(() => ({ query })),
    );
    TestBed.tick();
    return resource;
  }

  const request = () => httpMock.expectOne((r) => r.method === "POST" && r.body.query === query);

  /** Lets the resource take in an answer and its settle effect run. */
  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
  }

  const fail = (status = 500) =>
    request().flush({ message: "boom" }, { status, statusText: "Error" });

  it("waits 5, 10, 20, 40, 80 and 160 seconds, then 180 for every failure after that", async () => {
    const resource = create();
    const waits: (number | null)[] = [];

    for (let failure = 0; failure < 9; failure++) {
      fail();
      await settle();
      const wait = resource.retryCountdownSec();
      waits.push(wait);
      // The countdown is the time to the next request: not a second earlier, and then it goes out.
      await vi.advanceTimersByTimeAsync((wait! - 1) * 1000);
      httpMock.expectNone(() => true);
      await vi.advanceTimersByTimeAsync(1000);
      TestBed.tick();
    }

    expect(waits).toEqual([5, 10, 20, 40, 80, 160, 180, 180, 180]);
    request();
  });

  it("counts the wait down a second at a time, then fires the retry", async () => {
    const resource = create();
    fail();
    await settle();
    expect(resource.retryCountdownSec()).toBe(5);

    await vi.advanceTimersByTimeAsync(1000);
    expect(resource.retryCountdownSec()).toBe(4);
    await vi.advanceTimersByTimeAsync(3000);
    expect(resource.retryCountdownSec()).toBe(1);
    httpMock.expectNone(() => true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(resource.retryCountdownSec()).toBeNull();
    TestBed.tick();
    expect(resource.isFetching()).toBe(true);
    request().flush({ data: { lines: [{ id: "1" }] } });
    await settle();

    expect(resource.hasError()).toBe(false);
    expect(resource.retryCountdownSec()).toBeNull();
  });

  it("starts the schedule over at 5 seconds after an answer comes through", async () => {
    const resource = create();
    fail();
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    TestBed.tick();
    fail();
    await settle();
    expect(resource.retryCountdownSec()).toBe(10);

    resource.retryNow();
    TestBed.tick();
    request().flush({ data: { lines: [{ id: "1" }] } });
    await settle();
    expect(resource.hasError()).toBe(false);

    resource.reload();
    TestBed.tick();
    fail();
    await settle();

    expect(resource.retryCountdownSec()).toBe(5);
  });

  it("treats a GraphQL errors answer with no data as a failure, and retries it on the same schedule", async () => {
    const resource = create();

    request().flush({ errors: [{ message: "Line service is down" }] });
    await settle();

    expect(resource.hasError()).toBe(true);
    expect(resource.errors()).toEqual([{ message: "Line service is down" }]);
    expect(resource.transportError()).toBeUndefined();
    expect(resource.data()).toBeUndefined();
    expect(resource.retryCountdownSec()).toBe(5);

    await vi.advanceTimersByTimeAsync(5000);
    TestBed.tick();
    request().flush({ data: { lines: [] } });
    await settle();
    expect(resource.hasError()).toBe(false);
  });

  it("stops the countdown when the owner is destroyed, so no request goes out afterwards", async () => {
    const resource = create();
    fail();
    await settle();
    expect(resource.retryCountdownSec()).toBe(5);

    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(60_000);

    httpMock.expectNone(() => true);
  });
});
