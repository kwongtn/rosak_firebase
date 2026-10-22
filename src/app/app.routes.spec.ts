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

/**
 * Node's fs, typed by hand: the runner is Node, but the spec type-check has no Node types.
 * `process.getBuiltinModule` needs Node 22.3+; `engines` and CI pin 24.
 */
const fs = (
  globalThis as unknown as {
    process: {
      getBuiltinModule(id: "node:fs"): {
        existsSync(path: string): boolean;
        readFileSync(path: string, encoding: "utf8"): string;
      };
    };
  }
).process.getBuiltinModule("node:fs");

/** A static value import or re-export of a relative path. `import type` is erased, import() lazy. */
const STATIC_IMPORT =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^;]*?\bfrom\s+)?["'](\.{1,2}\/[^"']+)["']/gm;

/**
 * Every source file `src/main.ts` reaches through static imports, as paths relative to the project
 * root (where `ng test` runs): esbuild puts all of them in the initial bundle.
 * shortcut: a regex over source text, so a value-style import used only as a type counts as eager
 * and a non-relative app import is not followed; walk `ng build --stats-json`'s metafile instead if
 * either ever matters.
 */
function eagerSourceFiles(): string[] {
  const seen = new Set<string>();
  const queue = ["src/main.ts"];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const [, specifier] of fs.readFileSync(file, "utf8").matchAll(STATIC_IMPORT)) {
      const base = new URL(specifier, `file:///${file}`).pathname.slice(1);
      const target = [`${base}.ts`, `${base}/index.ts`, base].find((path) => fs.existsSync(path));
      if (target === undefined) {
        throw new Error(`${file} imports "${specifier}", which resolves to no file`);
      }
      queue.push(target);
    }
  }
  return [...seen];
}

describe("app routes: what main.ts pulls into the initial bundle", () => {
  it("statically reaches no page, shell, auth, GraphQL client, preferences or methodology code", () => {
    const eager = eagerSourceFiles();

    // The walk has to see the real graph, or the check below passes on an empty list.
    expect(eager).toEqual(
      expect.arrayContaining(["src/app/app.config.ts", "src/app/app.routes.ts", "src/app/app.ts"]),
    );
    // Each of these is lazy on purpose (docs/COMPONENTS.md -> Initial bundle). One static import
    // from the eager graph moves it, and everything it imports, into main: HomeStore alone brought
    // Firebase Auth and the methodology registry, about 156 kB.
    expect(
      eager.filter((file) =>
        /^src\/app\/(?:features|shell|core\/(?:auth|graphql|preferences|methodology))\//.test(file),
      ),
    ).toEqual([]);
  });
});
