import { TestBed } from "@angular/core/testing";
import type { Route } from "@angular/router";
import { firstValueFrom, of, type Observable } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { HoverPreloadStrategy } from "./hover-preload.strategy";

describe("HoverPreloadStrategy", () => {
  let strategy: HoverPreloadStrategy;
  let load: Mock<() => Observable<string>>;

  const hoverRoute: Route = { path: "tracker", data: { preload: "hover" } };

  beforeEach(() => {
    vi.useFakeTimers();
    strategy = TestBed.inject(HoverPreloadStrategy);
    load = vi.fn((): Observable<string> => of("loaded"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads nothing for a hover route until it was asked for", () => {
    strategy.preload(hoverRoute, load).subscribe();
    vi.advanceTimersByTime(100);
    expect(load).not.toHaveBeenCalled();
  });

  it("loads a hover route after a short delay once preloadRoute named it", async () => {
    strategy.preloadRoute("tracker");
    const result = firstValueFrom(strategy.preload(hoverRoute, load));
    expect(load).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    await expect(result).resolves.toBe("loaded");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("ignores a route that is not marked data.preload = hover", () => {
    strategy.preloadRoute("tracker");
    strategy.preload({ path: "tracker" }, load).subscribe();
    vi.advanceTimersByTime(100);
    expect(load).not.toHaveBeenCalled();
  });
});
