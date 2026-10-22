import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { CompactNavComponent } from "./compact-nav.component";

// ThemeService reads window.matchMedia in its constructor; the test DOM doesn't provide it.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

@Component({ template: "" })
class TestOutlet {}

async function renderNav(currentModulePath: string, isAdmin = false): Promise<HTMLElement> {
  await TestBed.resetTestingModule()
    .configureTestingModule({
      imports: [CompactNavComponent],
      providers: [
        provideRouter([{ path: "**", component: TestOutlet }]),
        // Stub (logged out, or admin when `isAdmin`) rather than the real AuthService: the unit-test builder shares one module
        // registry across spec files, so the real one can come back already bound to another spec's
        // mocked firebase/app (about.page.spec) and throw from getAuth() depending on file order.
        {
          provide: AuthService,
          useValue: { isLoggedIn: signal(isAdmin), isAdmin: signal(isAdmin) },
        },
      ],
    })
    .compileComponents();

  const fixture = TestBed.createComponent(CompactNavComponent);
  fixture.componentRef.setInput("currentModulePath", currentModulePath);
  fixture.componentRef.setInput("currentModuleLabel", currentModulePath.slice(1));
  fixture.detectChanges();
  await TestBed.inject(Router).navigateByUrl(currentModulePath);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** Labels of the cross-feature module links rendered in the nav (excludes the brand trigger
 * label and the auth-gated Profile/Console links, which the default test auth state hides). */
function moduleLinkLabels(el: HTMLElement): string[] {
  return [...el.querySelectorAll("a")]
    .map((a) => a.textContent?.trim())
    .filter((t): t is string => !!t);
}

describe("CompactNavComponent", () => {
  it("hides the current module's own link (no redundant self-entry)", async () => {
    const el = await renderNav("/tracker");
    const labels = moduleLinkLabels(el);
    expect(labels).not.toContain("Tracker");
    expect(labels[0]).toBe("Home");
    // The other module links still render.
    expect(labels).toEqual(
      expect.arrayContaining(["Home", "TranSPOT", "Gallery", "Insiden", "About"]),
    );
  });

  it("reuses the same pill for other modules without listing them either", async () => {
    const el = await renderNav("/gallery");
    const labels = moduleLinkLabels(el);
    expect(labels).not.toContain("Gallery");
    expect(labels).toContain("Tracker");
  });

  it("renders the shared logo, bug button and (for admins) Console menu with the compact sizing", async () => {
    const el = await renderNav("/tracker", true);
    expect(el.querySelector("svg[app-brand-logo]")?.classList.contains("h-5")).toBe(true);
    expect(el.querySelector("button[app-report-bug-button]")?.classList.contains("size-7")).toBe(
      true,
    );
    const menu = el.querySelector("div[app-console-menu]");
    expect(menu?.classList.contains("hidden")).toBe(true);
    expect(menu?.classList.contains("sm:block")).toBe(true);
    expect(menu?.querySelector("a")?.getAttribute("href")).toBe("/console/spotting");
  });

  it("omits the Console menu for non-admins", async () => {
    const el = await renderNav("/tracker");
    expect(el.querySelector("div[app-console-menu]")).toBeNull();
  });

  it("always shows exactly the module links minus the active one", async () => {
    const el = await renderNav("/insiden");
    const labels = moduleLinkLabels(el);
    expect(labels).not.toContain("Insiden");
    expect(labels).toEqual(
      expect.arrayContaining(["Home", "TranSPOT", "Tracker", "Gallery", "About"]),
    );
  });
});
