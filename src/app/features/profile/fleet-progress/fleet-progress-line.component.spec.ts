import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LineProgress } from "../data/fleet-progress.util";
import { FleetProgressLineComponent } from "./fleet-progress-line.component";

/** Two of the line's five vehicles spotted, so three are missing. */
const ROW: LineProgress = {
  lineId: "4",
  code: "LRT KJL",
  spotted: 2,
  total: 5,
  percent: 40,
  spottedIds: new Set(["1", "2"]),
};

/** The line's roster as the API returns it: unordered, and `EMU10` would sort before `EMU3` as text. */
const ROSTER = [
  { id: "10", identificationNo: "EMU10" },
  { id: "3", identificationNo: "EMU3" },
  { id: "1", identificationNo: "EMU1" },
  { id: "4", identificationNo: "EMU4" },
  { id: "2", identificationNo: "EMU2" },
];

describe("FleetProgressLineComponent", () => {
  let fixture: ComponentFixture<FleetProgressLineComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FleetProgressLineComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    httpMock.verify();
  });

  function render(row: LineProgress = ROW): void {
    fixture = TestBed.createComponent(FleetProgressLineComponent);
    fixture.componentRef.setInput("row", row);
    fixture.detectChanges();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const byTestId = (id: string): HTMLElement | null =>
    root().querySelector<HTMLElement>(`[data-testid="${id}"]`);

  function rosterRequests() {
    return httpMock.match(
      (request) => request.method === "POST" && request.body.query.includes("LineFleet"),
    );
  }

  /** Opens the row and answers the roster request it makes. */
  async function openWithRoster(): Promise<void> {
    byTestId("fleet-line-toggle")?.click();
    fixture.detectChanges();
    const [request] = rosterRequests();
    request.flush({ data: { lines: [{ id: ROW.lineId, vehicles: ROSTER }] } });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function vehicleLinks(): HTMLAnchorElement[] {
    return [...root().querySelectorAll<HTMLAnchorElement>('[data-testid="fleet-line-vehicle"]')];
  }

  it("shows the line code and how many of its vehicles are spotted", () => {
    render();

    expect(byTestId("fleet-line-code")?.textContent?.trim()).toBe("LRT KJL");
    expect(byTestId("fleet-line-count")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "2 of 5 spotted",
    );
  });

  it("exposes the progress to assistive tech as a progressbar in vehicles", () => {
    render();

    const bar = byTestId("fleet-line-bar");
    expect(bar?.getAttribute("role")).toBe("progressbar");
    expect(bar?.getAttribute("aria-valuemin")).toBe("0");
    expect(bar?.getAttribute("aria-valuemax")).toBe("5");
    expect(bar?.getAttribute("aria-valuenow")).toBe("2");
    expect(bar?.getAttribute("aria-valuetext")).toBe("2 of 5 vehicles spotted");
    expect(bar?.getAttribute("aria-label")).toBe("LRT KJL fleet progress");
  });

  it("fills the bar to the spotted share", () => {
    render();

    const fill = byTestId("fleet-line-bar")?.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("40%");
  });

  it("asks for the line's roster only once the row is expanded", () => {
    render();

    expect(rosterRequests()).toHaveLength(0);
    expect(byTestId("fleet-line-toggle")?.getAttribute("aria-expanded")).toBe("false");
    expect(byTestId("fleet-line-toggle")?.textContent?.trim()).toBe("Show 3 not yet spotted");
  });

  it("requests the roster for this line on the first open", () => {
    render();

    byTestId("fleet-line-toggle")?.click();
    fixture.detectChanges();

    const requests = rosterRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].request.body.variables).toEqual({ lineId: "4" });
    requests[0].flush({ data: { lines: [{ id: "4", vehicles: ROSTER }] } });
  });

  it("says it is loading until the roster arrives", () => {
    render();

    byTestId("fleet-line-toggle")?.click();
    fixture.detectChanges();

    expect(byTestId("fleet-line-unspotted")?.textContent).toContain("Loading vehicles");
    expect(byTestId("fleet-line-toggle")?.getAttribute("aria-expanded")).toBe("true");
    rosterRequests().forEach((request) => request.flush({ data: { lines: [] } }));
  });

  it("lists only the unspotted vehicles, in natural order, each linking to its vehicle page", async () => {
    render();

    await openWithRoster();

    expect(vehicleLinks().map((link) => link.textContent?.trim())).toEqual([
      "EMU3",
      "EMU4",
      "EMU10",
    ]);
    expect(vehicleLinks().map((link) => link.getAttribute("href"))).toEqual([
      "/spotting/4/vehicle/3",
      "/spotting/4/vehicle/4",
      "/spotting/4/vehicle/10",
    ]);
    expect(byTestId("fleet-line-toggle")?.textContent?.trim()).toBe("Hide 3 not yet spotted");
  });

  it("collapses and re-opens from the list it already has, without asking again", async () => {
    render();
    await openWithRoster();

    byTestId("fleet-line-toggle")?.click();
    fixture.detectChanges();
    expect(byTestId("fleet-line-unspotted")).toBeNull();
    expect(byTestId("fleet-line-toggle")?.getAttribute("aria-expanded")).toBe("false");

    byTestId("fleet-line-toggle")?.click();
    fixture.detectChanges();

    expect(vehicleLinks()).toHaveLength(3);
    expect(rosterRequests()).toHaveLength(0);
  });

  it("points the toggle at the list it controls while open", async () => {
    render();
    await openWithRoster();

    const controls = byTestId("fleet-line-toggle")?.getAttribute("aria-controls");

    expect(controls).toBe("fleet-unspotted-4");
    expect(byTestId("fleet-line-unspotted")?.id).toBe(controls);
  });

  it("offers a retry instead of an empty list when the roster fails to load", async () => {
    render();
    byTestId("fleet-line-toggle")?.click();
    fixture.detectChanges();

    rosterRequests()[0].flush("down", { status: 500, statusText: "Server Error" });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root().querySelector("app-retry-banner")?.textContent).toContain(
      "Couldn't load this line's vehicles.",
    );
    expect(vehicleLinks()).toHaveLength(0);
  });

  it("has nothing to expand on a fully spotted line, and says so", () => {
    render({
      ...ROW,
      spotted: 5,
      total: 5,
      percent: 100,
      spottedIds: new Set(["1", "2", "3", "4", "10"]),
    });

    expect(byTestId("fleet-line-toggle")).toBeNull();
    expect(byTestId("fleet-line-complete")?.textContent?.trim()).toBe("All spotted");
    expect(byTestId("fleet-line-bar")?.getAttribute("aria-valuenow")).toBe("5");
    expect(rosterRequests()).toHaveLength(0);
  });
});
