import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import type { FavouriteVehicle } from "../data/profile.queries";
import { FleetProgressComponent } from "./fleet-progress.component";

type FleetLine = FavouriteVehicle["vehicle"]["lines"][number];

const KJL: FleetLine = { id: "4", code: "LRT KJL", totalVehicleCount: 116 };
const AGL: FleetLine = { id: "5", code: "LRT AGL", totalVehicleCount: 50 };

function spotted(id: string, lines: FleetLine[]): FavouriteVehicle {
  return { vehicle: { id, identificationNo: `V${id}`, lines }, count: 1 };
}

describe("FleetProgressComponent", () => {
  let fixture: ComponentFixture<FleetProgressComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    // The info popover probes matchMedia after its first render, and the test DOM has none.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    await TestBed.configureTestingModule({
      imports: [FleetProgressComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  function render(favouriteVehicles: readonly FavouriteVehicle[] | null | undefined): void {
    fixture = TestBed.createComponent(FleetProgressComponent);
    fixture.componentRef.setInput("favouriteVehicles", favouriteVehicles);
    fixture.detectChanges();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function rowCodes(): string[] {
    return [...root().querySelectorAll('[data-testid="fleet-line-code"]')].map(
      (el) => el.textContent?.trim() ?? "",
    );
  }

  it.each([
    ["an empty list", []],
    ["null", null],
    ["undefined", undefined],
    ["vehicles on no line", [spotted("9", [])]],
  ])("renders nothing for %s, not a heading over nothing", (_, input) => {
    render(input);

    expect(root().querySelector('[data-testid="fleet-progress"]')).toBeNull();
    expect(root().textContent?.trim()).toBe("");
  });

  it("renders one row per line, by line code, with its own count", () => {
    render([spotted("1", [KJL]), spotted("2", [KJL, AGL]), spotted("3", [AGL])]);

    expect(rowCodes()).toEqual(["LRT AGL", "LRT KJL"]);
    const counts = [...root().querySelectorAll('[data-testid="fleet-line-count"]')].map((el) =>
      el.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(counts).toEqual(["2 of 50 spotted", "2 of 116 spotted"]);
  });

  it("titles the card Fleet progress", () => {
    render([spotted("1", [KJL])]);

    expect(root().querySelector("h2")?.textContent?.trim()).toContain("Fleet progress");
  });

  it("explains the metric from the methodology registry, from the card title", () => {
    render([spotted("1", [KJL])]);

    const trigger = root().querySelector<HTMLButtonElement>("h2 button");
    expect(trigger?.getAttribute("aria-label")).toBe("What is Fleet progress?");
    trigger?.click();
    fixture.detectChanges();

    const panel = root().querySelector('[data-testid="fleet-progress-popover"]');
    expect(panel?.textContent).toContain(metricTooltip("fleet.progress"));
    expect(panel?.querySelector("a")?.getAttribute("href")).toBe("/methodology#sightings");
  });

  it("says the card is private to the owner", () => {
    render([spotted("1", [KJL])]);

    expect(root().textContent).toContain("Only you see this.");
  });
});
