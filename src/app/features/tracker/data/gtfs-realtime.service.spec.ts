import { transit_realtime } from "gtfs-realtime-bindings";
import { GtfsRealtimeService, RtSource } from "./gtfs-realtime.service";

const URL_A = "https://example.test/a.pb";
const INTERVAL_MS = 30_000;

/** A protobuf-encoded `FeedMessage` holding one vehicle per id, as a fresh `ArrayBuffer`. */
function feedBuffer(ids: string[]): ArrayBuffer {
  const bytes = transit_realtime.FeedMessage.encode({
    header: { gtfsRealtimeVersion: "2.0" },
    entity: ids.map((id) => ({ id: `e-${id}`, vehicle: { vehicle: { id } } })),
  }).finish();
  return new Uint8Array(bytes).buffer;
}

function okResponse(ids: string[]): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: () => Promise.resolve(feedBuffer(ids)),
  } as unknown as Response;
}

function failResponse(status = 503, statusText = "Service Unavailable"): Response {
  return { ok: false, status, statusText } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe("RtSource", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let source: RtSource;

  /** Lets pending promise continuations (and zero-delay timers) run without moving the clock on. */
  const flush = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    source?.pause();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("success", () => {
    it("fetches once on resume, publishes the vehicles and clears the loading flags", async () => {
      fetchMock.mockResolvedValue(okResponse(["v1", "v2"]));
      source = new RtSource({ sourceUrl: URL_A });

      source.resume();
      expect(source.isLoading()).toBe(true);
      expect(source.hasLoadedOnce()).toBe(false);
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(URL_A);
      expect(Object.keys(source.feedEntities()).sort()).toEqual(["v1", "v2"]);
      expect(source.isLoading()).toBe(false);
      expect(source.hasLoadedOnce()).toBe(true);
      expect(source.hasError()).toBe(false);
      expect(source.lastErrorMessage()).toBeNull();
    });

    it("polls again after the configured interval, not before", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(okResponse(["v1"])));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: INTERVAL_MS });
      source.resume();
      await flush();

      await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("defaults the cadence to 30 seconds", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(okResponse(["v1"])));
      source = new RtSource({ sourceUrl: URL_A });
      source.resume();
      await flush();

      await vi.advanceTimersByTimeAsync(29_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("merges vehicles across polls and ignores entities without a vehicle id", async () => {
      fetchMock
        .mockResolvedValueOnce(okResponse(["v1"]))
        .mockResolvedValueOnce(okResponse(["v2", ""]));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: 1000 });
      source.resume();
      await flush();
      const first = source.feedEntities();

      await vi.advanceTimersByTimeAsync(1000);

      expect(Object.keys(source.feedEntities()).sort()).toEqual(["v1", "v2"]);
      // A new object every poll: the info panel's isStale compares by reference.
      expect(source.feedEntities()).not.toBe(first);
    });

    it("ticks the countdown down towards the next poll", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(okResponse(["v1"])));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: INTERVAL_MS });
      source.resume();
      await flush();

      await vi.advanceTimersByTimeAsync(15_000);

      expect(source.secondsRemaining()).toBeCloseTo(15, 0);
      expect(source.percentRemaining()).toBeCloseTo(50, 0);
    });
  });

  describe("failure and backoff", () => {
    it("records an HTTP error status without touching the data it already holds", async () => {
      fetchMock
        .mockResolvedValueOnce(okResponse(["v1"]))
        .mockResolvedValueOnce(failResponse(503, "Service Unavailable"));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: 1000 });
      source.resume();
      await flush();
      await vi.advanceTimersByTimeAsync(1000);

      expect(source.hasError()).toBe(true);
      expect(source.lastErrorMessage()).toBe("503 Service Unavailable");
      expect(source.isLoading()).toBe(false);
      expect(Object.keys(source.feedEntities())).toEqual(["v1"]);
    });

    it("records a network rejection, an Error by message and anything else as a string", async () => {
      fetchMock.mockRejectedValueOnce(new Error("network down"));
      source = new RtSource({ sourceUrl: URL_A });
      source.resume();
      await flush();
      expect(source.lastErrorMessage()).toBe("network down");

      fetchMock.mockRejectedValueOnce("plain string");
      source.retryNow();
      await flush();
      expect(source.lastErrorMessage()).toBe("plain string");
    });

    it("doubles the wait from 5 s and caps it at 5 minutes", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(failResponse()));
      source = new RtSource({ sourceUrl: URL_A });
      source.resume();
      await flush();

      const waits = [5, 10, 20, 40, 80, 160, 300, 300].map((s) => s * 1000);
      let calls = 1;
      for (const wait of waits) {
        expect(fetchMock).toHaveBeenCalledTimes(calls);
        await vi.advanceTimersByTimeAsync(wait - 1);
        expect(fetchMock).toHaveBeenCalledTimes(calls);
        await vi.advanceTimersByTimeAsync(1);
        calls += 1;
        expect(fetchMock).toHaveBeenCalledTimes(calls);
      }
    });

    it("backs off independently of the normal cadence", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(failResponse()));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: 3_600_000 });
      source.resume();
      await flush();

      await vi.advanceTimersByTimeAsync(5000);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("starts over at 5 s after a success", async () => {
      fetchMock
        .mockResolvedValueOnce(failResponse())
        .mockResolvedValueOnce(failResponse())
        .mockResolvedValueOnce(okResponse(["v1"]))
        .mockResolvedValue(failResponse());
      source = new RtSource({ sourceUrl: URL_A, intervalMs: 1000 });
      source.resume();
      await flush();
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(source.hasError()).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(source.hasError()).toBe(true);
      await vi.advanceTimersByTimeAsync(4999);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it("clears the error flags on the next success", async () => {
      fetchMock.mockResolvedValueOnce(failResponse()).mockResolvedValue(okResponse(["v1"]));
      source = new RtSource({ sourceUrl: URL_A });
      source.resume();
      await flush();
      expect(source.hasError()).toBe(true);

      await vi.advanceTimersByTimeAsync(5000);

      expect(source.hasError()).toBe(false);
      expect(source.lastErrorMessage()).toBeNull();
    });

    it("retryNow skips what is left of the backoff wait", async () => {
      fetchMock.mockResolvedValueOnce(failResponse()).mockResolvedValue(okResponse(["v1"]));
      source = new RtSource({ sourceUrl: URL_A });
      source.resume();
      await flush();

      source.retryNow();
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(source.hasError()).toBe(false);
      // The abandoned 5 s timer must not fire a third request.
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("pause and resume", () => {
    it("pause stops the next poll and keeps the data", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(okResponse(["v1"])));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: 1000 });
      source.resume();
      await flush();

      source.pause();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(Object.keys(source.feedEntities())).toEqual(["v1"]);
    });

    it("resume fetches immediately instead of waiting out the old delay", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(okResponse(["v1"])));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: INTERVAL_MS });
      source.resume();
      await flush();
      source.pause();

      source.resume();
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("resume restarts the countdown ticker that pause stopped", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(okResponse(["v1"])));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: INTERVAL_MS });
      source.resume();
      await flush();
      source.pause();
      source.resume();
      await flush();

      await vi.advanceTimersByTimeAsync(10_000);

      expect(source.secondsRemaining()).toBeCloseTo(20, 0);
    });

    it("keeps the backoff attempt count across a pause", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(failResponse()));
      source = new RtSource({ sourceUrl: URL_A });
      source.resume();
      await flush();
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      source.pause();

      // The resume fetch is the third failure, so the next wait is 20 s (attempt 3), not 5 s.
      source.resume();
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(19_999);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    // F148 (data-reliability audit): pause() only clears timers, so a fetch that is still in
    // flight re-arms the poll timer when it lands and the feed polls on in the background.
    // `it.fails` pins that: when F148 is fixed this starts to pass, which fails the suite as a
    // reminder to turn it into a plain `it`.
    it.fails("does not poll again when paused while a fetch is in flight (F148)", async () => {
      const pending = deferred<Response>();
      fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValue(okResponse(["v1"]));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: 1000 });
      source.resume();
      await flush();
      expect(source.isLoading()).toBe(true);

      source.pause();
      pending.resolve(okResponse(["v1"]));
      await flush();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("still applies the response of a fetch that was in flight when it was paused", async () => {
      const pending = deferred<Response>();
      fetchMock.mockReturnValueOnce(pending.promise);
      source = new RtSource({ sourceUrl: URL_A, intervalMs: 1000 });
      source.resume();
      await flush();

      source.pause();
      pending.resolve(okResponse(["v1"]));
      await flush();

      expect(Object.keys(source.feedEntities())).toEqual(["v1"]);
      expect(source.isLoading()).toBe(false);
      expect(source.hasLoadedOnce()).toBe(true);
    });
  });

  describe("setRefreshInterval", () => {
    it("null stops polling after the current success and 'Do not refresh' stays quiet", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(okResponse(["v1"])));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: INTERVAL_MS });
      source.resume();
      await flush();

      source.setRefreshInterval(null);
      await vi.advanceTimersByTimeAsync(3_600_000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("a source created with intervalMs null fetches once and never again", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(okResponse(["v1"])));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: null });
      source.resume();
      await flush();

      await vi.advanceTimersByTimeAsync(3_600_000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("a number after null starts polling again on the new cadence", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(okResponse(["v1"])));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: null });
      source.resume();
      await flush();

      source.setRefreshInterval(5000);
      await vi.advanceTimersByTimeAsync(5000);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("re-times the pending poll when the cadence changes", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(okResponse(["v1"])));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: INTERVAL_MS });
      source.resume();
      await flush();

      source.setRefreshInterval(2000);
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("leaves a committed backoff wait alone and uses the new cadence once it succeeds", async () => {
      fetchMock.mockResolvedValueOnce(failResponse()).mockResolvedValue(okResponse(["v1"]));
      source = new RtSource({ sourceUrl: URL_A, intervalMs: INTERVAL_MS });
      source.resume();
      await flush();

      source.setRefreshInterval(1000);
      await vi.advanceTimersByTimeAsync(4999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});

describe("GtfsRealtimeService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let service: GtfsRealtimeService;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn(() => Promise.resolve(okResponse(["v1"])));
    vi.stubGlobal("fetch", fetchMock);
    service = new GtfsRealtimeService();
  });

  afterEach(() => {
    service.pauseAll();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("starts a new source on its first upsert and keeps an existing one", async () => {
    service.upsertSources({ a: { sourceUrl: URL_A } });
    await vi.advanceTimersByTimeAsync(0);
    const first = service.sources()["a"];

    service.upsertSources({
      a: { sourceUrl: URL_A },
      b: { sourceUrl: "https://example.test/b.pb" },
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(service.sources()["a"]).toBe(first);
    expect(Object.keys(service.sources()).sort()).toEqual(["a", "b"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pauses and drops a source that is no longer selected", async () => {
    service.upsertSources({ a: { sourceUrl: URL_A }, b: { sourceUrl: URL_A } });
    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockClear();

    service.upsertSources({ a: { sourceUrl: URL_A } });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(Object.keys(service.sources())).toEqual(["a"]);
    // Only the kept source polls again.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pauseAll stops every source and resumeAll refetches straight away", async () => {
    service.upsertSources({ a: { sourceUrl: URL_A }, b: { sourceUrl: URL_A } });
    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockClear();

    service.pauseAll();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();

    service.resumeAll();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("setRefreshInterval applies to running sources and to ones added later", async () => {
    service.upsertSources({ a: { sourceUrl: URL_A } });
    await vi.advanceTimersByTimeAsync(0);

    service.setRefreshInterval(2000);
    expect(service.refreshIntervalMs()).toBe(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    service.upsertSources({ a: { sourceUrl: URL_A }, b: { sourceUrl: URL_A } });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("a source added after 'Do not refresh' fetches once and stays quiet", async () => {
    service.setRefreshInterval(null);

    service.upsertSources({ a: { sourceUrl: URL_A } });
    await vi.advanceTimersByTimeAsync(3_600_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("setRefreshInterval(null) stops every source from polling", async () => {
    service.upsertSources({ a: { sourceUrl: URL_A } });
    await vi.advanceTimersByTimeAsync(0);

    service.setRefreshInterval(null);
    await vi.advanceTimersByTimeAsync(3_600_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
