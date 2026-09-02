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

describe("PollingSource", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: "browser" }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
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
});
