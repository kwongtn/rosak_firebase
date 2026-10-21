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

/** The connection, driven by the tests: `navigator.onLine` is read through this. */
let navigatorOnLine = true;

/** Flips `navigator.onLine` and fires `online`/`offline` on window, the way the browser does. */
function setOnline(online: boolean): void {
  navigatorOnLine = online;
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

describe("PollingSource", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    documentHidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => documentHidden });
    navigatorOnLine = true;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => navigatorOnLine });
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: "browser" }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    Reflect.deleteProperty(document, "hidden");
    Reflect.deleteProperty(navigator, "onLine");
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

  describe("connectivity", () => {
    it("pauses while offline: no refresh fires however long the connection stays down", () => {
      const onRefresh = vi.fn();
      createSource(onRefresh);

      vi.advanceTimersByTime(10000);
      setOnline(false);
      vi.advanceTimersByTime(300000);

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it("refreshes at once on reconnect, before the deadline, and restarts the cadence there", () => {
      const onRefresh = vi.fn();
      const source = createSource(onRefresh);

      vi.advanceTimersByTime(10000);
      setOnline(false);
      vi.advanceTimersByTime(5000);
      setOnline(true);

      // 15s of the 30s countdown were still left: reconnecting does not wait for them.
      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(source.secondsRemaining()).toBe(30);
      vi.advanceTimersByTime(29999);
      expect(onRefresh).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(onRefresh).toHaveBeenCalledTimes(2);
    });

    it("starts paused when created offline, and refreshes on reconnect", () => {
      const onRefresh = vi.fn();
      navigatorOnLine = false;
      createSource(onRefresh);

      vi.advanceTimersByTime(60000);
      expect(onRefresh).not.toHaveBeenCalled();

      setOnline(true);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("stays paused when the tab becomes visible while still offline", () => {
      const onRefresh = vi.fn();
      createSource(onRefresh);

      setDocumentHidden(true);
      setOnline(false);
      setDocumentHidden(false);
      vi.advanceTimersByTime(120000);

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it("does not refresh on a reconnect while hidden: the return to visible decides", () => {
      const onRefresh = vi.fn();
      createSource(onRefresh);

      vi.advanceTimersByTime(10000);
      setDocumentHidden(true);
      setOnline(false);
      setOnline(true);
      expect(onRefresh).not.toHaveBeenCalled();

      // Visible again 5s later, with 15s of the deadline left: re-armed, not refreshed.
      vi.advanceTimersByTime(5000);
      setDocumentHidden(false);
      expect(onRefresh).not.toHaveBeenCalled();
      vi.advanceTimersByTime(15000);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("stays off a 'Never' beat on reconnect", () => {
      const onRefresh = vi.fn();
      const source = createSource(onRefresh);
      source.setIntervalMs(null);

      setOnline(false);
      setOnline(true);
      vi.advanceTimersByTime(120000);

      expect(onRefresh).not.toHaveBeenCalled();
      expect(source.secondsRemaining()).toBe(0);
    });

    it("removes its online and offline listeners when destroyed", () => {
      const removeSpy = vi.spyOn(window, "removeEventListener");
      const onRefresh = vi.fn();
      createSource(onRefresh);

      TestBed.resetTestingModule();
      setOnline(false);
      setOnline(true);

      expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
      expect(onRefresh).not.toHaveBeenCalled();
      removeSpy.mockRestore();
    });

    it("does not listen for connectivity on the server", () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: "server" }],
      });
      const addSpy = vi.spyOn(window, "addEventListener");

      const onRefresh = vi.fn();
      createSource(onRefresh);
      setOnline(false);
      setOnline(true);

      expect(addSpy).not.toHaveBeenCalledWith("online", expect.any(Function));
      expect(addSpy).not.toHaveBeenCalledWith("offline", expect.any(Function));
      expect(onRefresh).not.toHaveBeenCalled();
      addSpy.mockRestore();
    });
  });
});
