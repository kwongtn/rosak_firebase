import { isPlatformBrowser, ViewportScroller } from "@angular/common";
import { PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NavigationEnd, NavigationStart, Router, Scroll } from "@angular/router";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteScrollMemoryService } from "./route-scroll-memory.service";

type RouterEventLike = NavigationStart | NavigationEnd | Scroll;

function start(url: string): NavigationStart {
  return new NavigationStart(1, url);
}

function end(url: string): NavigationEnd {
  return new NavigationEnd(1, url, url);
}

function scroll(
  url: string,
  anchor: string | null = null,
  position: [number, number] | null = null,
): Scroll {
  return new Scroll(end(url), position, anchor);
}

async function flushMicrotask(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("route-scroll-memory", () => {
  let events: Subject<RouterEventLike>;
  let routerUrl: string;
  let getScrollPosition: ReturnType<typeof vi.fn>;
  let scrollToPosition: ReturnType<typeof vi.fn>;

  function configure(platformId: "browser" | "server" = "browser"): void {
    events = new Subject<RouterEventLike>();
    routerUrl = "/page";
    getScrollPosition = vi.fn().mockReturnValue([10, 20]);
    scrollToPosition = vi.fn();

    const fakeRouter = { url: routerUrl, events } as unknown as Router;
    const fakeViewportScroller = {
      getScrollPosition,
      scrollToPosition,
    } as unknown as ViewportScroller;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: fakeRouter },
        { provide: ViewportScroller, useValue: fakeViewportScroller },
        { provide: PLATFORM_ID, useValue: platformId },
      ],
    });
  }

  beforeEach(() => {
    configure();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("saves the current viewport position on NavigationStart", () => {
    TestBed.inject(RouteScrollMemoryService);

    events.next(start("/page"));

    expect(getScrollPosition).toHaveBeenCalledTimes(1);
    expect(getScrollPosition).toHaveReturnedWith([10, 20]);
  });

  it("restores a previously visited position after the router Scroll event", async () => {
    getScrollPosition.mockReturnValueOnce([10, 20]).mockReturnValueOnce([30, 40]);
    TestBed.inject(RouteScrollMemoryService);

    events.next(start("/page"));
    events.next(end("/other"));
    events.next(start("/other"));
    events.next(end("/page"));
    events.next(scroll("/page"));

    await flushMicrotask();

    expect(scrollToPosition).toHaveBeenCalledWith([10, 20], { behavior: "instant" });
  });

  it("leaves a popstate restore to the router's per-history-entry position", async () => {
    getScrollPosition.mockReturnValueOnce([10, 20]).mockReturnValueOnce([30, 40]);
    TestBed.inject(RouteScrollMemoryService);

    events.next(start("/page"));
    events.next(end("/other"));
    events.next(start("/other"));
    events.next(end("/page"));
    // RouterScroller emits a non-null position when it is restoring this history entry itself.
    events.next(scroll("/page", null, [0, 400]));

    await flushMicrotask();

    expect(scrollToPosition).not.toHaveBeenCalled();
  });

  it("does not override anchor scrolling", async () => {
    TestBed.inject(RouteScrollMemoryService);

    events.next(start("/page"));
    events.next(end("/other"));
    events.next(start("/other"));
    events.next(end("/page"));
    events.next(scroll("/page", "section"));

    await flushMicrotask();

    expect(scrollToPosition).not.toHaveBeenCalled();
  });

  it("keeps the router's top behavior for query-only changes on the same path", async () => {
    TestBed.inject(RouteScrollMemoryService);

    events.next(start("/page?sort=asc"));
    events.next(end("/page?sort=desc"));
    events.next(scroll("/page?sort=desc"));

    await flushMicrotask();

    expect(scrollToPosition).not.toHaveBeenCalled();
  });

  it("does not restore a target URL that was never visited", async () => {
    TestBed.inject(RouteScrollMemoryService);

    events.next(start("/outside"));
    events.next(end("/new-page"));
    events.next(scroll("/new-page"));

    await flushMicrotask();

    expect(scrollToPosition).not.toHaveBeenCalled();
  });

  it("does not subscribe on the server platform", () => {
    TestBed.resetTestingModule();
    configure("server");

    TestBed.inject(RouteScrollMemoryService);

    expect(events.observed).toBe(false);
    expect(getScrollPosition).not.toHaveBeenCalled();
  });

  it("keeps the service platform guard compatible with isPlatformBrowser", () => {
    expect(isPlatformBrowser("browser")).toBe(true);
    expect(isPlatformBrowser("server")).toBe(false);
  });
});
