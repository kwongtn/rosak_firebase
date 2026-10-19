import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PollingSource } from "./polling-source";

function createSource(onRefresh: () => void = () => {}): PollingSource {
  let source: PollingSource | undefined;
  TestBed.runInInjectionContext(() => {
    source = new PollingSource(onRefresh);
  });
  if (!source) {
    throw new Error("PollingSource was not created inside an injection context");
  }
  return source;
}

/** The document's visibility, driven by the tests: `document.hidden` is read through this. */
let documentHidden = false;

/** Flips `document.hidden` and fires `visibilitychange`, the way a tab switch does. */
function setDocumentHidden(hidden: boolean): void {
  documentHidden = hidden;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("PollingSource", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    documentHidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => documentHidden });
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: "browser" }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    Reflect.deleteProperty(document, "hidden");
    vi.useRealTimers();
  });

  it("defaults to a 30s interval and triggers refresh after 30s", () => {
    const onRefresh = vi.fn();
    const source = createSource(onRefresh);

    expect(source.intervalMs()).toBe(30000);
    expect(onRefresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30000);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps refreshing on every subsequent interval", () => {
    const onRefresh = vi.fn();
    createSource(onRefresh);

    vi.advanceTimersByTime(30000);
    vi.advanceTimersByTime(30000);

    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("takes effect when the interval changes (old deadline is canceled, countdown restarts from now)", () => {
    const onRefresh = vi.fn();
    const source = createSource(onRefresh);

    vi.advanceTimersByTime(10000); // 10s into a 30s countdown
    source.setIntervalMs(60000);

    // The stale 30s deadline must never fire (it would land at t=30s, i.e. 20s from now).
    vi.advanceTimersByTime(29000);
    expect(onRefresh).not.toHaveBeenCalled();

    // The new 60s deadline, measured from the change, fires at t=70s.
    vi.advanceTimersByTime(31000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("stops refreshing when the interval is set to null", () => {
    const onRefresh = vi.fn();
    const source = createSource(onRefresh);

    source.setIntervalMs(null);
    vi.advanceTimersByTime(120000);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(source.secondsRemaining()).toBe(0);
  });

  it("resumes a paused beat at the cadence it last ran at", () => {
    const onRefresh = vi.fn();
    const source = createSource(onRefresh);

    source.setIntervalMs(60000);
    source.setIntervalMs(null);
    vi.advanceTimersByTime(120000);
    expect(onRefresh).not.toHaveBeenCalled();

    source.resume();

    expect(source.intervalMs()).toBe(60000);
    expect(source.secondsRemaining()).toBe(60);

    vi.advanceTimersByTime(59000);
    expect(onRefresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("resumes at the 30s default when no cadence was ever named", () => {
    const source = createSource();
    source.setIntervalMs(null);

    source.resume();

    expect(source.intervalMs()).toBe(30000);
    expect(source.secondsRemaining()).toBe(30);
  });

  it("resume on a running beat restarts the countdown without duplicating timers", () => {
    const onRefresh = vi.fn();
    const source = createSource(onRefresh);

    source.resume();
    source.resume();
    vi.advanceTimersByTime(30000);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("refreshNow fires immediately and resets the countdown", () => {
    const onRefresh = vi.fn();
    const source = createSource(onRefresh);

    vi.advanceTimersByTime(10000);
    expect(source.secondsRemaining()).toBe(20);

    source.refreshNow();

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(source.secondsRemaining()).toBe(30);

    // The reset countdown, not the original, is what expires next.
    vi.advanceTimersByTime(20000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("decrements secondsRemaining once per second", () => {
    const source = createSource();

    expect(source.secondsRemaining()).toBe(30);
    vi.advanceTimersByTime(1000);
    expect(source.secondsRemaining()).toBe(29);
    vi.advanceTimersByTime(1000);
    expect(source.secondsRemaining()).toBe(28);
  });

  describe("document visibility", () => {
    it("pauses while the document is hidden: no refresh fires however long the tab stays hidden", () => {
      const onRefresh = vi.fn();
      createSource(onRefresh);

      setDocumentHidden(true);
      vi.advanceTimersByTime(300000);

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it("re-arms for the time that remained when the tab becomes visible before the deadline", () => {
      const onRefresh = vi.fn();
      const source = createSource(onRefresh);

      vi.advanceTimersByTime(10000);
      setDocumentHidden(true);
      vi.advanceTimersByTime(5000);
      setDocumentHidden(false);

      // The 30s deadline was set at t=0 and it is now t=15s, so 15s remain. Nothing fires early.
      expect(source.secondsRemaining()).toBe(15);
      vi.advanceTimersByTime(14999);
      expect(onRefresh).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("keeps the cadence's percent scale when re-arming, so the countdown does not jump", () => {
      const source = createSource();

      vi.advanceTimersByTime(10000);
      setDocumentHidden(true);
      vi.advanceTimersByTime(5000);
      setDocumentHidden(false);

      // 15s of a 30s cadence remain, which is 50% — not a fresh 100%.
      expect(source.percentRemaining()).toBeCloseTo(50, 1);
    });

    it("refreshes immediately on becoming visible when the deadline passed while hidden", () => {
      const onRefresh = vi.fn();
      createSource(onRefresh);

      vi.advanceTimersByTime(10000);
      setDocumentHidden(true);
      vi.advanceTimersByTime(50000);
      setDocumentHidden(false);

      expect(onRefresh).toHaveBeenCalledTimes(1);

      // The cadence restarts from that refresh rather than from the old deadline.
      vi.advanceTimersByTime(29000);
      expect(onRefresh).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(onRefresh).toHaveBeenCalledTimes(2);
    });

    it("starts paused when created while hidden, and re-arms the full remainder on visibility", () => {
      const onRefresh = vi.fn();
      documentHidden = true;
      createSource(onRefresh);

      vi.advanceTimersByTime(5000);
      expect(onRefresh).not.toHaveBeenCalled();

      setDocumentHidden(false);
      vi.advanceTimersByTime(24999);
      expect(onRefresh).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("stays off a 'Never' beat when the tab becomes visible", () => {
      const onRefresh = vi.fn();
      const source = createSource(onRefresh);
      source.setIntervalMs(null);

      setDocumentHidden(true);
      setDocumentHidden(false);
      vi.advanceTimersByTime(120000);

      expect(onRefresh).not.toHaveBeenCalled();
      expect(source.secondsRemaining()).toBe(0);
    });

    it("removes its visibility listener when destroyed", () => {
      const removeSpy = vi.spyOn(document, "removeEventListener");
      createSource();

      TestBed.resetTestingModule();

      expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
      removeSpy.mockRestore();
    });

    it("does not listen for visibility on the server", () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: "server" }],
      });
      const addSpy = vi.spyOn(document, "addEventListener");

      const onRefresh = vi.fn();
      createSource(onRefresh);
      setDocumentHidden(false);
      vi.advanceTimersByTime(60000);

      expect(addSpy).not.toHaveBeenCalledWith("visibilitychange", expect.any(Function));
      expect(onRefresh).not.toHaveBeenCalled();
      addSpy.mockRestore();
    });
  });
});
