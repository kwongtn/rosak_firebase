import {
  ApplicationRef,
  Component,
  PLATFORM_ID,
  provideZonelessChangeDetection,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Route, Router, Routes, provideRouter } from "@angular/router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { environment } from "../../../environments/environment";
import { routes as appRoutes } from "../../app.routes";
import { AnalyticsService } from "./analytics.service";

// The unit-test builder shares one module cache across spec files (`isolate: false`), so reset it on
// both sides of this file; see "Unit-test isolation" in docs/COMPONENTS.md.
vi.hoisted(() => vi.resetModules());

const sdk = vi.hoisted(() => ({
  isSupported: vi.fn(),
  initializeAnalytics: vi.fn(),
  logEvent: vi.fn(),
  setAnalyticsCollectionEnabled: vi.fn(),
}));
const app = vi.hoisted(() => ({ getApps: vi.fn(), initializeApp: vi.fn() }));

vi.mock("firebase/analytics", () => sdk);
vi.mock("firebase/app", () => app);

afterAll(() => vi.resetModules());

@Component({ template: "" })
class StubPage {}

/**
 * The real route tree: `app.routes.ts` and every lazily loaded children file, with each page, guard,
 * resolver and provider swapped for nothing. Paths, matchers and titles stay the real ones, so a
 * reshaped or added route is seen by this spec.
 */
async function realRoutes(list: Routes): Promise<Routes> {
  return Promise.all(
    list.map(async (route): Promise<Route> => {
      const lazy = route.loadChildren ? ((await route.loadChildren()) as Routes) : undefined;
      const children = route.children ?? lazy;
      return {
        path: route.path,
        matcher: route.matcher,
        pathMatch: route.pathMatch,
        title: typeof route.title === "string" ? route.title : undefined,
        ...(children ? { children: await realRoutes(children) } : { component: StubPage }),
      };
    }),
  );
}

/** Every routable leaf with a `path`, as a [url with a marker for each param, configured pattern]. */
function leaves(list: Routes, prefix: string[] = []): [string, string][] {
  return list.flatMap((route): [string, string][] => {
    if (route.path === "**" || route.matcher) {
      return [];
    }
    const parts = route.path ? [...prefix, route.path] : prefix;
    return route.children
      ? leaves(route.children, parts)
      : [[`/${parts.join("/").replace(/:\w+/g, "SECRET-ID")}`, `/${parts.join("/")}`]];
  });
}

const ANALYTICS = { analytics: true };

describe("AnalyticsService", () => {
  let router: Router;

  let routes: Routes;

  beforeAll(async () => {
    routes = await realRoutes(appRoutes);
  });

  beforeEach(() => {
    sdk.isSupported.mockResolvedValue(true);
    sdk.initializeAnalytics.mockReturnValue(ANALYTICS);
    app.getApps.mockReturnValue([{ name: "[DEFAULT]" }]);
    document.title = "stale title";
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter(routes)],
    });
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    [...Object.values(sdk), ...Object.values(app)].forEach((mock) => mock.mockReset());
    document.title = "";
  });

  /** Creates the service and runs the first render, which is what starts it. */
  async function start(): Promise<void> {
    TestBed.inject(AnalyticsService);
    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect(sdk.isSupported).toHaveBeenCalledTimes(1));
    // `start()` continues after the awaited `isSupported()`.
    await vi.waitFor(() => expect(sdk.setAnalyticsCollectionEnabled).toHaveBeenCalled());
  }

  /** The `page_view` events logged so far. */
  const pageViews = () =>
    sdk.logEvent.mock.calls
      .filter(([, name]) => name === "page_view")
      .map(([, , params]) => params);

  async function visit(url: string): Promise<void> {
    await router.navigateByUrl(url);
    // The page_view is logged one microtask after NavigationEnd.
    await Promise.resolve();
  }

  it("logs exactly one page_view for the first navigation, with the current title and a path stripped of ids, query and fragment", async () => {
    await start();

    await visit("/profile/Fq3x9UidOfSomeone?utm_source=mail#top");

    expect(pageViews()).toEqual([
      {
        page_path: "/profile/:id",
        page_location: `${window.location.origin}/profile/:id`,
        page_title: "MLPTF | Profile",
      },
    ]);
  });

  it("turns the SDK's own automatic page_view off, so it cannot count the landing a second time", async () => {
    await start();

    expect(sdk.initializeAnalytics).toHaveBeenCalledExactlyOnceWith(
      { name: "[DEFAULT]" },
      { config: { send_page_view: false } },
    );
    expect(sdk.setAnalyticsCollectionEnabled).toHaveBeenCalledExactlyOnceWith(
      ANALYTICS,
      environment.production,
    );
  });

  it("logs the page the rider landed on when the first navigation ended before the SDK was ready", async () => {
    TestBed.inject(AnalyticsService);
    await router.navigateByUrl("/station/17");
    expect(sdk.isSupported).not.toHaveBeenCalled();

    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect(pageViews()).toHaveLength(1));

    expect(pageViews()[0]).toMatchObject({
      page_path: "/station/:id",
      page_title: "MLPTF | Station",
    });
  });

  it("logs each later navigation with its own title", async () => {
    await start();

    await visit("/station/17");
    await visit("/profile/abc");

    expect(pageViews().map((view) => [view.page_path, view.page_title])).toEqual([
      ["/station/:id", "MLPTF | Station"],
      ["/profile/:id", "MLPTF | Profile"],
    ]);
  });

  it.each([
    ["/", "/"],
    ["/profile", "/profile"],
    ["/profile/abc123", "/profile/:id"],
    ["/gallery", "/gallery"],
    ["/gallery/9f2c?photo=1", "/gallery/:mediaId"],
    ["/station/42#assets", "/station/:id"],
    ["/spotting/KJL/vehicle/SCS-12", "/spotting/:lineId/vehicle/:vehicleId"],
    ["/spotting/KJL/details", "/spotting/:lineId/details"],
    ["/spotting/KJL/details/situasi", "/spotting/:lineId/details/:tab"],
    ["/insiden/2026-10-21", "/insiden/:date"],
    ["/nowhere/at/all?x=1", "/**"],
  ])("normalises %s to the route pattern %s", async (url, pattern) => {
    await start();

    await visit(url);

    expect(pageViews().at(-1)).toMatchObject({ page_path: pattern });
  });

  it("does nothing when the browser cannot run Analytics", async () => {
    sdk.isSupported.mockResolvedValue(false);
    TestBed.inject(AnalyticsService);
    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect(sdk.isSupported).toHaveBeenCalledTimes(1));

    await visit("/profile/abc");

    expect(sdk.initializeAnalytics).not.toHaveBeenCalled();
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });

  it("never lets an id into page_path: every real route in the app is logged as its pattern", async () => {
    await start();
    const cases = leaves(routes);
    // The routes with a matcher cannot be walked: they are the `it.each` cases above (three today).
    const matchers = (list: Routes): number =>
      list.reduce((n, r) => n + (r.matcher ? 1 : 0) + matchers(r.children ?? []), 0);
    expect(matchers(routes)).toBe(3);
    expect(cases.length).toBeGreaterThan(8);

    for (const [url, pattern] of cases) {
      await visit(url);
      expect(pageViews().at(-1)).toMatchObject({ page_path: pattern });
    }
    expect(
      pageViews()
        .map((view) => view.page_path)
        .join(),
    ).not.toContain("SECRET-ID");
  });

  it("stays away from the SDK on the server", async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    TestBed.inject(AnalyticsService);
    TestBed.inject(ApplicationRef).tick();
    await Promise.resolve();

    expect(sdk.isSupported).not.toHaveBeenCalled();
  });
});
