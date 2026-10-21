import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OnlineService } from "./online.service";

/** Makes `navigator.onLine` report `value` until the test's afterEach removes the override. */
function stubNavigatorOnLine(value: boolean): void {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

function createService(platform: "browser" | "server" = "browser"): OnlineService {
  TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
  return TestBed.inject(OnlineService);
}

describe("OnlineService", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    Reflect.deleteProperty(navigator, "onLine");
    vi.restoreAllMocks();
  });

  it("starts from navigator.onLine", () => {
    stubNavigatorOnLine(false);

    expect(createService().isOnline()).toBe(false);
  });

  it("follows the window's offline and online events", () => {
    const service = createService();
    expect(service.isOnline()).toBe(true);

    window.dispatchEvent(new Event("offline"));
    expect(service.isOnline()).toBe(false);

    window.dispatchEvent(new Event("online"));
    expect(service.isOnline()).toBe(true);
  });

  it("removes its listeners when the injector is destroyed", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const service = createService();

    TestBed.resetTestingModule();
    window.dispatchEvent(new Event("offline"));

    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    expect(service.isOnline()).toBe(true);
  });

  it("is always online on the server and listens to nothing", () => {
    stubNavigatorOnLine(false);
    const addSpy = vi.spyOn(window, "addEventListener");

    const service = createService("server");
    window.dispatchEvent(new Event("offline"));

    expect(service.isOnline()).toBe(true);
    expect(addSpy).not.toHaveBeenCalledWith("offline", expect.any(Function));
  });
});
