import { PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { injectIsBrowser } from "./is-browser";

/** Boots a fresh TestBed with `PLATFORM_ID` stubbed to the given platform, then reads the helper. */
function isBrowserOn(platform: "browser" | "server"): boolean {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: platform }],
  });
  return TestBed.runInInjectionContext(() => injectIsBrowser());
}

describe("injectIsBrowser", () => {
  it("returns true when PLATFORM_ID is the browser platform", () => {
    expect(isBrowserOn("browser")).toBe(true);
  });

  it("returns false when PLATFORM_ID is the server platform", () => {
    expect(isBrowserOn("server")).toBe(false);
  });
});
