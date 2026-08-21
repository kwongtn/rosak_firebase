import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTrailingDebounce, searchTermOrUndefined } from "./search-debounce.util";

describe("createTrailingDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not run the callback before the delay elapses", () => {
    const debouncer = createTrailingDebounce(300);
    const run = vi.fn();

    debouncer.push(run);
    vi.advanceTimersByTime(299);

    expect(run).not.toHaveBeenCalled();
  });

  it("runs the callback exactly once after the delay", () => {
    const debouncer = createTrailingDebounce(300);
    const run = vi.fn();

    debouncer.push(run);
    vi.advanceTimersByTime(300);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("collapses rapid pushes into a single trailing run", () => {
    const debouncer = createTrailingDebounce(300);
    const runs: string[] = [];

    debouncer.push(() => runs.push("first"));
    vi.advanceTimersByTime(200);
    debouncer.push(() => runs.push("second"));
    vi.advanceTimersByTime(200);
    debouncer.push(() => runs.push("third"));
    vi.advanceTimersByTime(300);

    expect(runs).toEqual(["third"]);
  });

  it("cancel prevents a scheduled run", () => {
    const debouncer = createTrailingDebounce(300);
    const run = vi.fn();

    debouncer.push(run);
    debouncer.cancel();
    vi.advanceTimersByTime(1000);

    expect(run).not.toHaveBeenCalled();
  });

  it("isPending tracks the timer lifecycle", () => {
    const debouncer = createTrailingDebounce(300);

    expect(debouncer.isPending).toBe(false);
    debouncer.push(vi.fn());
    expect(debouncer.isPending).toBe(true);
    vi.advanceTimersByTime(300);
    expect(debouncer.isPending).toBe(false);
  });
});

describe("searchTermOrUndefined", () => {
  it("trims surrounding whitespace", () => {
    expect(searchTermOrUndefined("  lrt  ")).toBe("lrt");
  });

  it("maps blank input to undefined so no filter is sent", () => {
    expect(searchTermOrUndefined("   ")).toBeUndefined();
    expect(searchTermOrUndefined("")).toBeUndefined();
  });
});
