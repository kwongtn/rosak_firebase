import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router, RouterOutlet, provideRouter } from "@angular/router";
import { describe, expect, it } from "vitest";

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
    const el = await renderAt("/console");
    const labels = [...el.querySelectorAll("nav a")].map((a) => a.textContent?.trim());
    expect(labels).toEqual(["Spotting Queue", "Incident Approval", "Social Media Links"]);
  });

  it("highlights only Spotting Queue on /console", async () => {
    const el = await renderAt("/console");
    expect(activeLabels(el)).toEqual(["Spotting Queue"]);
  });

  it("highlights Incident Approval on /console/insiden/pending without bleeding to the parent item", async () => {
    const el = await renderAt("/console/insiden/pending");
    expect(activeLabels(el)).toEqual(["Incident Approval"]);
  });

  it("highlights Social Media Links on /console/insiden/links", async () => {
    const el = await renderAt("/console/insiden/links");
    expect(activeLabels(el)).toEqual(["Social Media Links"]);
  });
});
