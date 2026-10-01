import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { describe, expect, it } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { adminOnlyGuard } from "../../core/auth/admin-only.guard";
import { CONSOLE_ROUTES } from "./console.routes";

@Component({ template: "" })
class TestOutlet {}

/** Same structure as CONSOLE_ROUTES with every lazy loadComponent swapped for a stub, so the
 * router spec never instantiates the real console pages (GraphQL/ReCaptcha DI). Redirect-only
 * routes (pathMatch/redirectTo) are left untouched — Angular rejects redirect + loadComponent. */
const stubRoutes = CONSOLE_ROUTES.map((route) =>
  route.loadComponent ? { ...route, loadComponent: () => Promise.resolve(TestOutlet) } : route,
);

/** adminOnlyGuard only reads whenReady + isAdmin — a plain object is enough here. */
const fakeAuth = {
  whenReady: Promise.resolve(),
  isAdmin: () => true,
};

async function makeRouter(): Promise<Router> {
  await TestBed.resetTestingModule()
    .configureTestingModule({
      providers: [
        provideRouter([
          { path: "console", children: stubRoutes },
          { path: "**", component: TestOutlet },
        ]),
        { provide: AuthService, useValue: fakeAuth },
      ],
    })
    .compileComponents();
  return TestBed.inject(Router);
}

describe("CONSOLE_ROUTES", () => {
  it("redirects the bare /console to /console/spotting", async () => {
    const router = await makeRouter();
    await router.navigateByUrl("/console");
    expect(router.url).toBe("/console/spotting");
  });

  it("keeps /console/insiden/pending on its own route (redirect does not swallow siblings)", async () => {
    const router = await makeRouter();
    await router.navigateByUrl("/console/insiden/pending");
    expect(router.url).toBe("/console/insiden/pending");
  });

  it("serves the links queue from /console/links", async () => {
    const router = await makeRouter();
    await router.navigateByUrl("/console/links");
    expect(router.url).toBe("/console/links");
  });

  it("redirects the old /console/insiden/links URL to /console/links", async () => {
    const router = await makeRouter();
    await router.navigateByUrl("/console/insiden/links");
    expect(router.url).toBe("/console/links");
  });

  it("carries no canActivate on the legacy redirect (Angular forbids it there)", () => {
    const legacy = CONSOLE_ROUTES.find((route) => route.path === "insiden/links");
    expect(legacy?.redirectTo).toBe("links");
    expect(legacy?.pathMatch).toBe("full");
    // The redirect is unguarded BY DESIGN — the target route is guarded, so the
    // old URL is guarded transitively. A guard here is a config error, not a
    // hardening measure.
    expect(legacy?.canActivate).toBeUndefined();
  });

  it("applies adminOnlyGuard to every console route that loads a component", () => {
    const guarded = CONSOLE_ROUTES.filter((route) => !route.redirectTo);
    expect(guarded.length).toBeGreaterThan(0);
    expect(guarded.every((route) => route.canActivate?.includes(adminOnlyGuard))).toBe(true);
  });
});
