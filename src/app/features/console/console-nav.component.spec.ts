import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router, RouterOutlet, provideRouter } from "@angular/router";
import { describe, expect, it } from "vitest";

import { CONSOLE_LINKS } from "../../shell/nav-config";
import { ConsoleNavComponent } from "./console-nav.component";

const ACTIVE_CLASS = "bg-primary";

@Component({ template: "" })
class TestOutlet {}

@Component({
  imports: [ConsoleNavComponent, RouterOutlet],
  template: `<app-console-nav /><router-outlet />`,
})
class TestHost {}

/** RouterLinkActive reads the live router URL, so each case navigates a
 * real (wildcard-configured) router before reading the rendered classes. */
async function renderAt(url: string): Promise<HTMLElement> {
  await TestBed.resetTestingModule()
    .configureTestingModule({
      imports: [TestHost],
      providers: [provideRouter([{ path: "**", component: TestOutlet }])],
    })
    .compileComponents();

  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  await TestBed.inject(Router).navigateByUrl(url);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function activeLabels(el: HTMLElement): (string | undefined)[] {
  return [...el.querySelectorAll("nav a")]
    .filter((a) => a.className.includes(ACTIVE_CLASS))
    .map((a) => a.textContent?.trim());
}

describe("ConsoleNavComponent", () => {
  it("renders the three console sections", async () => {
    const el = await renderAt("/console/spotting");
    const labels = [...el.querySelectorAll("nav a")].map((a) => a.textContent?.trim());
    expect(labels).toEqual(["Spotting Queue", "Incident Approval", "Social Media Links"]);
  });

  it("renders exactly the shared CONSOLE_LINKS, in order", async () => {
    const el = await renderAt("/console/spotting");
    const rendered = [...el.querySelectorAll("nav a")].map((a) => [
      a.getAttribute("href"),
      a.textContent?.trim(),
    ]);
    expect(rendered).toEqual(CONSOLE_LINKS.map((l) => [l.path, l.label]));
  });

  it("marks only the active section with aria-current=page", async () => {
    const el = await renderAt("/console/insiden/pending");
    const current = [...el.querySelectorAll("nav a[aria-current='page']")].map((a) =>
      a.textContent?.trim(),
    );
    expect(current).toEqual(["Incident Approval"]);
  });

  it("highlights only Spotting Queue on /console/spotting", async () => {
    const el = await renderAt("/console/spotting");
    expect(activeLabels(el)).toEqual(["Spotting Queue"]);
  });

  it("highlights Incident Approval on /console/insiden/pending without bleeding to the parent item", async () => {
    const el = await renderAt("/console/insiden/pending");
    expect(activeLabels(el)).toEqual(["Incident Approval"]);
  });

  it("highlights Social Media Links on /console/links", async () => {
    const el = await renderAt("/console/links");
    expect(activeLabels(el)).toEqual(["Social Media Links"]);
  });

  it("links the Social Media Links pill to the new /console/links path", async () => {
    const el = await renderAt("/console/spotting");
    const hrefs = Array.from(el.querySelectorAll("nav a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/console/links");
    expect(hrefs).not.toContain("/console/insiden/links");
  });
});
