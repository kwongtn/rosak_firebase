import { Component, PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreferencesService } from "../../../core/preferences/preferences.service";
import { HomeViewModeService } from "./home-view-mode.service";

/** The preferences service's own storage key — restated so a rename breaks this spec loudly. */
const STORAGE_KEY = "rosak:preferences:v1";

/**
 * An inert host for the router's route table.
 *
 * The service reads `route.queryParamMap`, so the specs navigate a REAL router rather than stubbing
 * `ActivatedRoute`: a stubbed `queryParamMap` is not a route, and the deep-link specs would then
 * pass against a param stream the app never actually has.
 */
@Component({ selector: "app-view-host-stub", template: "" })
class ViewHostStub {}

describe("home-view-mode.service: HomeViewModeService", () => {
  let navigate: ReturnType<typeof vi.fn>;
  let preferences: PreferencesService;

  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * Boots the service on a fresh route table.
   *
   * `navigate` is spied THROUGH the real router rather than replaced, so the service's own write
   * half can be asserted without the router actually re-activating anything mid-test.
   */
  async function boot(platform?: string): Promise<HomeViewModeService> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: "", component: ViewHostStub }]),
        HomeViewModeService,
        ...(platform ? [{ provide: PLATFORM_ID, useValue: platform }] : []),
      ],
    });
    await TestBed.compileComponents();
    preferences = TestBed.inject(PreferencesService);
    navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    const service = TestBed.inject(HomeViewModeService);
    TestBed.tick();
    return service;
  }

  /** Navigates the REAL router so the service's next read sees the new query params. */
  async function gotoUrl(url: string): Promise<void> {
    navigate.mockClear();
    await TestBed.inject(Router).navigateByUrl(url);
    TestBed.tick();
  }

  it("reads ?view= over the stored preference", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ viewMode: "rider" }));
    const service = await boot();

    await gotoUrl("/?view=pro");

    expect(service.view()).toBe("pro");
  });

  it("falls back to the stored preference when the URL carries no view", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pinnedLineIds: [], viewMode: "pro", density: "comfortable" }),
    );
    const service = await boot();

    expect(service.view()).toBe("pro");
  });

  it("degrades an unrecognised ?view= to the DEFAULT rather than to the stored preference", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ viewMode: "pro" }));
    const service = await boot();

    await gotoUrl("/?view=wizard");

    // A URL is user input: an unknown value must resolve to a view the UI actually offers rather
    // than silently becoming "whatever this reader last chose".
    expect(service.view()).toBe("rider");
  });

  it("mirrors a stored pro view into the URL, so the address bar is always shareable", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ viewMode: "pro" }));
    await boot();

    const patch = navigate.mock.calls.at(-1)?.[1]?.queryParams as Record<string, unknown>;
    expect(patch["view"]).toBe("pro");
  });

  it("navigates NOTHING on a plain rider load, so no parameter appears that was not chosen", async () => {
    const service = await boot();

    // Stronger than asserting `view: null`: on the default the redundant-write guard means the
    // service never even reaches `navigate`, so a plain page load cannot grow a `?view=` at all.
    expect(service.view()).toBe("rider");
    expect(service.isDefaultView()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("removes the param when the reader switches BACK to the default", async () => {
    // The board's toggle only ever moved UP from a URL-less page, so nothing exercised the
    // direction that matters: leaving a URL which ALREADY pins `pro`.
    const service = await boot();
    await gotoUrl("/?view=pro");
    navigate.mockClear();

    service.setView("rider");

    expect(preferences.viewMode()).toBe("rider");
    const patch = navigate.mock.calls.at(-1)?.[1]?.queryParams as Record<string, unknown>;
    expect(patch["view"]).toBeNull();
    // `navigate` is stubbed, so the URL still says `pro` and the effective view keeps following it —
    // the real router would drop the param and this computed would read `rider` on the next emission.
  });

  it("writes BOTH the preference and the URL from setView()", async () => {
    // Acceptance rule: each half promises something observable. The preference survives a reload;
    // the URL survives being sent to somebody else. A toggle writing only one breaks one of them.
    const service = await boot();

    service.setView("pro");
    TestBed.tick();

    expect(preferences.viewMode()).toBe("pro");
    expect(service.view()).toBe("pro");
    const patch = navigate.mock.calls.at(-1)?.[1]?.queryParams as Record<string, unknown>;
    expect(patch["view"]).toBe("pro");
  });

  it("writes nothing when the URL already says what the service shows", async () => {
    // The guard that stops a browser back from immediately re-navigating onto the params it left.
    const service = await boot();
    await gotoUrl("/?view=pro");
    navigate.mockClear();

    TestBed.tick();

    expect(service.view()).toBe("pro");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("pushes a deep link DOWN into the durable preference, so it survives losing the URL", async () => {
    const service = await boot();

    await gotoUrl("/?view=pro");

    expect(preferences.viewMode()).toBe("pro");
  });

  it("never navigates on the server, where a reactive navigate() hangs the render", async () => {
    // The read half is pure param parsing, so a server-rendered `?view=pro` still renders the Pro
    // layout — but it must not ask the server's router for anything.
    const service = await boot("server");

    await gotoUrl("/?view=pro");

    expect(service.view()).toBe("pro");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not fight a toggle that already wrote both halves", async () => {
    // `signal.set` with an equal value does not notify, so the deep-link-to-preference effect stays
    // quiet and cannot bounce the reader back to the value they just chose.
    const service = await boot();

    service.setView("pro");
    TestBed.tick();
    navigate.mockClear();

    TestBed.tick();

    expect(service.view()).toBe("pro");
    expect(navigate).not.toHaveBeenCalled();
  });
});
