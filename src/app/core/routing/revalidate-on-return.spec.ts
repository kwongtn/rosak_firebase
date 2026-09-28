import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NavigationEnd, Router } from "@angular/router";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { revalidateOnReturn, urlPath } from "./revalidate-on-return";
import { isSpottingLineRoute } from "../../features/spotting/data/spotting-route-patterns";

function end(url: string): NavigationEnd {
  return new NavigationEnd(1, url, url);
}

describe("revalidate-on-return", () => {
  let events: Subject<NavigationEnd>;
  let reload: Mock<() => void>;

  beforeEach(() => {
    events = new Subject<NavigationEnd>();
    reload = vi.fn<() => void>();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: { events } as unknown as Router },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function install(): void {
    TestBed.runInInjectionContext(() => {
      revalidateOnReturn(isSpottingLineRoute, () => {
        reload();
      });
    });
  }

  it("strips query parameters and fragments from a URL", () => {
    expect(urlPath("/spotting/X?sort=asc#grid")).toBe("/spotting/X");
    expect(urlPath("/spotting/X#grid")).toBe("/spotting/X");
  });

  it("does not reload on the component's first NavigationEnd", () => {
    install();

    events.next(end("/spotting/X"));

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once when navigation returns from outside the route pattern", () => {
    install();

    events.next(end("/spotting/X"));
    events.next(end("/home"));
    events.next(end("/spotting/X"));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for a same-pattern param change", () => {
    install();

    events.next(end("/spotting/X"));
    events.next(end("/spotting/Y"));

    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload for a query-only change", () => {
    install();

    events.next(end("/spotting/X?sort=asc"));
    events.next(end("/spotting/X?sort=desc"));

    expect(reload).not.toHaveBeenCalled();
  });

  it("unsubscribes when the owning injection context is destroyed", () => {
    install();

    events.next(end("/spotting/X"));
    events.next(end("/home"));
    events.next(end("/spotting/X"));
    expect(reload).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();
    events.next(end("/home"));
    events.next(end("/spotting/X"));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
