import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_RECENT_LINES, PreferencesService } from "./preferences.service";

/** The service's own key, restated here on purpose: the spec must fail if the key ever moves. */
const STORAGE_KEY = "rosak:preferences:v1";

/**
 * Runs the browser-only `afterNextRender` hydration pass. `TestBed.tick()` is what flushes both
 * effects and after-render hooks outside a component fixture, so the service spec exercises the
 * SAME two-phase sequence the page does rather than reaching past the API to poke the signals.
 */
function hydrate(): void {
  TestBed.tick();
}

describe("PreferencesService", () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function configure(platformId: string = "browser"): PreferencesService {
    TestBed.configureTestingModule({
      providers: [PreferencesService, { provide: PLATFORM_ID, useValue: platformId }],
    });
    return TestBed.inject(PreferencesService);
  }

  describe("hydration", () => {
    it("starts on the defaults and reports itself unhydrated", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ pinnedLineIds: ["line-9"], viewMode: "pro", density: "compact" }),
      );

      const service = configure();

      expect(service.hydrated()).toBe(false);
      expect(service.pinnedLineIds()).toEqual([]);
      expect(service.viewMode()).toBe("rider");
      expect(service.density()).toBe("comfortable");
      expect(service.lastReportedLineId()).toBeNull();
      expect(service.recentLineIds()).toEqual([]);
    });

    it("loads the stored values once the browser hydration pass has run", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          pinnedLineIds: ["line-9", "line-3"],
          viewMode: "pro",
          density: "compact",
          lastReportedLineId: "line-3",
          recentLineIds: ["line-3"],
        }),
      );

      const service = configure();
      hydrate();

      expect(service.hydrated()).toBe(true);
      expect(service.pinnedLineIds()).toEqual(["line-9", "line-3"]);
      expect(service.viewMode()).toBe("pro");
      expect(service.density()).toBe("compact");
      expect(service.lastReportedLineId()).toBe("line-3");
      expect(service.recentLineIds()).toEqual(["line-3"]);
    });

    it("persists a change so a fresh instance reads it back", () => {
      const service = configure();
      hydrate();

      service.togglePin("line-1");
      service.setViewMode("pro");
      service.setDensity("compact");
      service.setLastReportedLine("line-2");
      service.pushRecentLine("line-2");
      hydrate();

      TestBed.resetTestingModule();
      const reloaded = configure();
      hydrate();

      expect(reloaded.pinnedLineIds()).toEqual(["line-1"]);
      expect(reloaded.viewMode()).toBe("pro");
      expect(reloaded.density()).toBe("compact");
      expect(reloaded.lastReportedLineId()).toBe("line-2");
      expect(reloaded.recentLineIds()).toEqual(["line-2"]);
    });
  });

  describe("SSR guard", () => {
    it("never touches storage on the server, and stays unhydrated forever", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ pinnedLineIds: ["line-9"], viewMode: "pro" }),
      );
      // Spied AFTER the fixture write, so only the SERVICE's own calls are observed below.
      const getItem = vi.spyOn(Storage.prototype, "getItem");
      const setItem = vi.spyOn(Storage.prototype, "setItem");

      const service = configure("server");
      hydrate();

      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(service.pinnedLineIds()).toEqual([]);
      expect(service.viewMode()).toBe("rider");
      expect(service.hydrated()).toBe(false);

      // Writes are still permitted through the public API; they simply do not reach storage.
      service.togglePin("line-1");
      hydrate();
      expect(setItem).not.toHaveBeenCalled();
    });
  });

  describe("corrupt or partial storage", () => {
    it("falls back to the defaults when the payload is not JSON", () => {
      localStorage.setItem(STORAGE_KEY, "{not json at all");

      const service = configure();
      hydrate();

      expect(service.pinnedLineIds()).toEqual([]);
      expect(service.viewMode()).toBe("rider");
    });

    it("falls back to the defaults when the payload is valid JSON but not an object", () => {
      localStorage.setItem(STORAGE_KEY, "[1, 2, 3]");

      const service = configure();
      hydrate();

      expect(service.density()).toBe("comfortable");
      expect(service.lastReportedLineId()).toBeNull();
    });

    it("keeps the fields it recognises and defaults only the invalid ones", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          pinnedLineIds: ["line-2"],
          viewMode: "SUPERUSER",
          density: "compact",
          lastReportedLineId: 42,
        }),
      );

      const service = configure();
      hydrate();

      // A half-recognisable payload is the COMMON case (an older deploy wrote fewer keys), so the
      // recognised fields must survive rather than the whole object being discarded.
      expect(service.pinnedLineIds()).toEqual(["line-2"]);
      expect(service.density()).toBe("compact");
      expect(service.viewMode()).toBe("rider");
      expect(service.lastReportedLineId()).toBeNull();
    });

    it("drops blank and duplicate ids from a stored list", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ pinnedLineIds: ["a", "", "a", "b"], recentLineIds: ["", "c", "c"] }),
      );

      const service = configure();
      hydrate();

      expect(service.pinnedLineIds()).toEqual(["a", "b"]);
      expect(service.recentLineIds()).toEqual(["c"]);
    });
  });

  describe("mutations", () => {
    it("toggles a pin on and back off, and ignores a blank id", () => {
      const service = configure();
      hydrate();

      expect(service.isPinned("line-1")).toBe(false);
      service.togglePin("line-1");
      expect(service.isPinned("line-1")).toBe(true);
      service.togglePin("line-1");
      expect(service.isPinned("line-1")).toBe(false);

      service.togglePin("");
      expect(service.pinnedLineIds()).toEqual([]);
    });

    it("keeps recents most-recent-first, de-duplicated, and capped", () => {
      const service = configure();
      hydrate();

      for (const id of ["a", "b", "c", "d", "e", "f"]) {
        service.pushRecentLine(id);
      }
      expect(service.recentLineIds()).toHaveLength(MAX_RECENT_LINES);
      expect(service.recentLineIds()).toEqual(["f", "e", "d", "c", "b"]);

      service.pushRecentLine("d");
      expect(service.recentLineIds()).toEqual(["d", "f", "e", "c", "b"]);

      service.pushRecentLine("");
      expect(service.recentLineIds()).toEqual(["d", "f", "e", "c", "b"]);
    });

    it("treats an empty last-reported line as unset", () => {
      const service = configure();
      hydrate();

      service.setLastReportedLine("");
      expect(service.lastReportedLineId()).toBeNull();

      service.setLastReportedLine("line-4");
      expect(service.lastReportedLineId()).toBe("line-4");

      service.setLastReportedLine(null);
      expect(service.lastReportedLineId()).toBeNull();
    });

    it("resets every field back to the defaults", () => {
      const service = configure();
      hydrate();

      service.togglePin("line-1");
      service.setViewMode("pro");
      service.setDensity("compact");
      service.setLastReportedLine("line-1");
      service.pushRecentLine("line-1");

      service.reset();

      expect(service.snapshot()).toEqual({
        pinnedLineIds: [],
        viewMode: "rider",
        density: "comfortable",
        lastReportedLineId: null,
        recentLineIds: [],
      });
    });

    it("ignores an unknown view mode or density rather than storing it", () => {
      const service = configure();
      hydrate();

      // The public setters are typed, but the runtime value can still arrive from an untyped caller
      // (a URL param, a CMS field). It must degrade to the default, not land in a signal that no
      // template branch handles.
      service.setViewMode("poweruser" as "pro");
      service.setDensity("roomy" as "compact");

      expect(service.viewMode()).toBe("rider");
      expect(service.density()).toBe("comfortable");
    });
  });

  describe("persist guard", () => {
    it("never writes the defaults over a rider's stored preferences", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ pinnedLineIds: ["stored-line"], viewMode: "pro" }),
      );
      const setItem = vi.spyOn(Storage.prototype, "setItem");

      const service = configure();
      hydrate();

      // An ungated persist effect fires on its FIRST run — before the read lands — and would have
      // written the empty defaults over the rider's real stored state. The one write that does
      // happen re-persists the hydrated value unchanged, so no call may carry empty pins.
      expect(service.pinnedLineIds()).toEqual(["stored-line"]);
      for (const call of setItem.mock.calls) {
        expect(String(call[1])).toContain("stored-line");
      }
    });
  });
});
