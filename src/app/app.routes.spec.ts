import { Component, Injectable, inject, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Title } from "@angular/platform-browser";
import { Route, Router, Routes, provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { describe, expect, it, vi } from "vitest";

import { routes } from "./app.routes";
import { HomeStore } from "./features/home/data/home.store";
import { HomeViewModeService } from "./features/home/data/home-view-mode.service";
import { LineStatusSheetService } from "./features/home/data/line-status-sheet.service";
import { HomePage } from "./features/home/home.page";
import { HOME_ROUTES } from "./features/home/home.routes";

@Component({ template: "" })
class StubPage {}

/** Stands in for a route-scoped provider such as HomeStore. */
@Injectable()
class RouteScopedProbe {}

@Component({ template: "" })
class ProbePage {
  readonly probe = inject(RouteScopedProbe);
}

const homeEntry = routes.find((route) => route.path === "");

/**
 * The real app routes with every lazy import swapped for a stub, except the home entry, whose
 * loader is `homeLoader`. Paths, `pathMatch`, matchers and titles stay the real ones: they are
 * what decides whether the router fetches the home chunk. Fresh route objects on every call, so
 * the router's per-Route cache of loaded children cannot leak between tests.
 */
function stubbedRoutes(homeLoader: NonNullable<Route["loadChildren"]>): Routes {
  return routes.map((route) => {
    if (route === homeEntry) {
      return { ...route, loadChildren: homeLoader };
    }
    if (route.loadChildren) {
      return {
        ...route,
        loadChildren: () => Promise.resolve([{ path: "**", component: StubPage }]),
      };
    }
    return route.loadComponent
      ? { ...route, loadComponent: () => Promise.resolve(StubPage) }
      : route;
  });
}

async function makeHarness(appRoutes: Routes): Promise<RouterTestingHarness> {
  TestBed.resetTestingModule().configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter(appRoutes)],
  });
  return RouterTestingHarness.create();
}

describe("app routes: the lazy home route", () => {
  it("lists the front page as a full-match lazy route, so it is not in the initial bundle", () => {
    expect(homeEntry?.pathMatch).toBe("full");
    expect(homeEntry?.loadChildren).toBeTypeOf("function");
    expect(homeEntry?.providers).toBeUndefined();
    expect(homeEntry?.title).toBe("MLPTF | Live Network Board");
  });

  it("puts the page and its route-scoped providers on the lazily loaded child", () => {
    expect(HOME_ROUTES).toHaveLength(1);
    const [home] = HOME_ROUTES;
    expect(home.path).toBe("");
    expect(home.component).toBe(HomePage);
    expect(home.providers).toEqual([HomeStore, HomeViewModeService, LineStatusSheetService]);
  });

  it.each([
    "/methodology",
    "/tracker",
    "/spotting/KJL",
    "/insiden",
    "/gallery/42",
    "/no-such-page",
  ])("never fetches the home chunk on a first navigation to %s", async (url) => {
    const homeLoader = vi.fn(() => Promise.resolve([{ path: "", component: StubPage }]));
    const harness = await makeHarness(stubbedRoutes(homeLoader));

    await harness.navigateByUrl(url);

    expect(TestBed.inject(Router).url).toBe(url);
    expect(homeLoader).not.toHaveBeenCalled();
  });

  it("fetches the home chunk once for /, with or without query params, and keeps the title", async () => {
    const homeLoader = vi.fn(() => Promise.resolve([{ path: "", component: StubPage }]));
    const harness = await makeHarness(stubbedRoutes(homeLoader));

    await harness.navigateByUrl("/", StubPage);
    await harness.navigateByUrl("/?view=pro", StubPage);

    expect(TestBed.inject(Router).url).toBe("/?view=pro");
    expect(homeLoader).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Title).getTitle()).toBe("MLPTF | Live Network Board");
  });

  it("keeps ONE route-scoped injector across visits while the page is recreated", async () => {
    const homeLoader = () =>
      Promise.resolve(
        HOME_ROUTES.map((route) => ({
          ...route,
          component: ProbePage,
          providers: [RouteScopedProbe],
        })),
      );
    const harness = await makeHarness(stubbedRoutes(homeLoader));

    const first = await harness.navigateByUrl("/", ProbePage);
    await harness.navigateByUrl("/methodology", StubPage);
    const second = await harness.navigateByUrl("/", ProbePage);

    expect(second).not.toBe(first);
    expect(second.probe).toBe(first.probe);
  });
});
