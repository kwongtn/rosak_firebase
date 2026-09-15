import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";

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

async function renderNav(currentModulePath: string): Promise<HTMLElement> {
  await TestBed.resetTestingModule()
    .configureTestingModule({
      imports: [CompactNavComponent],
      providers: [provideRouter([{ path: "**", component: TestOutlet }])],
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
    // The other module links still render.
    expect(labels).toEqual(expect.arrayContaining(["TranSPOT", "Gallery", "Insiden", "About"]));
  });

  it("reuses the same pill for other modules without listing them either", async () => {
    const el = await renderNav("/gallery");
    const labels = moduleLinkLabels(el);
    expect(labels).not.toContain("Gallery");
    expect(labels).toContain("Tracker");
  });

  it("always shows exactly the module links minus the active one", async () => {
    const el = await renderNav("/insiden");
    const labels = moduleLinkLabels(el);
    expect(labels).not.toContain("Insiden");
    expect(labels).toEqual(expect.arrayContaining(["TranSPOT", "Tracker", "Gallery", "About"]));
  });
});
