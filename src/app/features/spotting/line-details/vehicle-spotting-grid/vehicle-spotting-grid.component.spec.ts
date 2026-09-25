import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VehicleRow, VehicleType } from "../../data/spotting.queries";
import { VehicleSpottingGridComponent } from "./vehicle-spotting-grid.component";

const LINE_ID = "1";

/** Jul/Aug/Sep 2026 — the window `LineSpottingGrid` is asked for. */
const MONTHS = [
  new Date(Date.UTC(2026, 6, 1)),
  new Date(Date.UTC(2026, 7, 1)),
  new Date(Date.UTC(2026, 8, 1)),
];

function makeVehicle(id: string, identificationNo: string): VehicleRow {
  return {
    id,
    identificationNo,
    status: "IN_SERVICE",
    nickname: null,
    lastSpottingDate: null,
    inServiceSince: null,
    spottingCount: 0,
    notes: null,
    incidentCount: 0,
    wheelStatus: null,
  };
}

function makeVehicleType(id: string, displayName: string, vehicles: VehicleRow[]): VehicleType {
  return {
    id,
    internalName: id,
    displayName,
    vehicleStatusInServiceCount: vehicles.length,
    vehicleStatusNotSpottedCount: 0,
    vehicleStatusOutOfServiceCount: 0,
    vehicleStatusDecommissionedCount: 0,
    vehicleStatusMarriedCount: 0,
    vehicleStatusTestingCount: 0,
    vehicleStatusUnknownCount: 0,
    vehicleTotalCount: vehicles.length,
    vehicles,
  };
}

/** Two non-empty sections (sorted Alpha → Beta) with 3 vehicles total. */
const VEHICLE_TYPES: VehicleType[] = [
  makeVehicleType("type-a", "Alpha Class", [makeVehicle("v1", "101"), makeVehicle("v2", "102")]),
  makeVehicleType("type-b", "Beta Class", [makeVehicle("v3", "201")]),
];

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

/** Must run BEFORE `TestBed.createComponent` — the component reads `matchMedia` while
 * constructing to derive its `isNarrow` layout signal. */
function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function bodyScroll(root: HTMLElement): HTMLElement {
  const body = root.querySelector<HTMLElement>('[data-testid="grid-body-scroll"]');
  if (!body) {
    throw new Error('grid-body-scroll ([data-testid="grid-body-scroll"]) is missing');
  }
  return body;
}

describe("VehicleSpottingGridComponent", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (_callback: FrameRequestCallback) => 0);
  });

  afterEach(() => {
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  async function render(matches: boolean): Promise<ComponentFixture<VehicleSpottingGridComponent>> {
    stubMatchMedia(matches);
    await TestBed.configureTestingModule({
      imports: [VehicleSpottingGridComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(VehicleSpottingGridComponent);
    fixture.componentRef.setInput("lineId", LINE_ID);
    fixture.componentRef.setInput("vehicleTypes", VEHICLE_TYPES);
    fixture.componentRef.setInput("months", MONTHS);
    fixture.componentRef.setInput("statusFilter", null);
    fixture.componentRef.setInput("stickyOffset", 0);
    fixture.detectChanges();

    httpMock
      .match(
        (request) => request.method === "POST" && request.body.query.includes("LineSpottingGrid"),
      )
      .forEach((request) =>
        request.flush({
          data: {
            lines: [
              {
                id: LINE_ID,
                vehicleSpottingTrends: [{ dateKey: "2026-08-10", count: 2, vehicle: { id: "v1" } }],
              },
            ],
          },
        }),
      );

    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  describe("mobile layout (<768px)", () => {
    let fixture: ComponentFixture<VehicleSpottingGridComponent>;
    let root: HTMLElement;

    beforeEach(async () => {
      fixture = await render(false);
      root = fixture.nativeElement as HTMLElement;
    });

    it("hides the desktop names table", () => {
      expect(root.querySelector('[data-testid="grid-names-table"]')).toBeNull();
    });

    it("renders one full-width type row per non-empty section", () => {
      expect(root.querySelectorAll('[data-testid="grid-mobile-type-row"]').length).toBe(2);
    });

    it("renders one full-width name row per vehicle", () => {
      expect(root.querySelectorAll('[data-testid="grid-mobile-vehicle-row"]').length).toBe(3);
    });

    it("pins every type label and vehicle name with sticky left-0", () => {
      const pins = root.querySelectorAll<HTMLElement>(
        '[data-testid="grid-mobile-type-label"], [data-testid="grid-mobile-name-pin"]',
      );

      // 2 type labels + 3 vehicle name pins — keeps the class assertions below from
      // passing vacuously when the mobile rows are missing entirely.
      expect(pins.length).toBe(5);
      for (const pin of Array.from(pins)) {
        expect(pin.classList.contains("sticky")).toBe(true);
        expect(pin.classList.contains("left-0")).toBe(true);
      }
    });

    it("stacks each vehicle's name row directly above its own date row", () => {
      const nameRow = bodyScroll(root).querySelector<HTMLElement>(
        '[data-testid="grid-mobile-vehicle-row"]',
      );
      expect(nameRow).not.toBeNull();
      expect(nameRow?.tagName).toBe("TR");

      const dateRow = nameRow?.nextElementSibling;
      expect(dateRow?.tagName).toBe("TR");
      expect(dateRow?.querySelectorAll("td").length).toBeGreaterThan(0);
      expect(dateRow?.getAttribute("data-testid")).toBeNull();
    });

    it("stacks each type label row directly above its per-date totals row", () => {
      const typeRow = bodyScroll(root).querySelector<HTMLElement>(
        '[data-testid="grid-mobile-type-row"]',
      );
      expect(typeRow).not.toBeNull();
      expect(typeRow?.tagName).toBe("TR");

      const totalsRow = typeRow?.nextElementSibling;
      expect(totalsRow?.tagName).toBe("TR");
      expect(totalsRow?.querySelectorAll("td").length).toBeGreaterThan(0);
      expect(totalsRow?.querySelector('[data-testid="grid-mobile-vehicle-row"]')).toBeNull();
    });

    it("collapses a type's vehicle rows from its mobile label while keeping the label and totals", () => {
      const label = root.querySelector<HTMLElement>('[data-testid="grid-mobile-type-label"]');
      expect(label).not.toBeNull();

      label?.click();
      fixture.detectChanges();

      // Alpha Class (2 vehicles) collapsed → only Beta Class's single row is left.
      expect(root.querySelectorAll('[data-testid="grid-mobile-vehicle-row"]').length).toBe(1);
      expect(root.querySelectorAll('[data-testid="grid-mobile-type-row"]').length).toBe(2);

      const typeRows = root.querySelectorAll<HTMLElement>('[data-testid="grid-mobile-type-row"]');
      const firstTypeRow = typeRows[0];
      const totalsRow = firstTypeRow.nextElementSibling;
      expect(totalsRow?.tagName).toBe("TR");
      expect(totalsRow?.querySelectorAll("td").length).toBeGreaterThan(0);

      // The surviving name row belongs to Beta Class — it follows Beta's own type row.
      const remainingNameRow = root.querySelector<HTMLElement>(
        '[data-testid="grid-mobile-vehicle-row"]',
      );
      expect(remainingNameRow).not.toBeNull();
      if (remainingNameRow) {
        expect(
          typeRows[1].compareDocumentPosition(remainingNameRow) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    });
  });

  describe("desktop layout (>=768px)", () => {
    let root: HTMLElement;

    beforeEach(async () => {
      const fixture = await render(true);
      root = fixture.nativeElement as HTMLElement;
    });

    it("renders the desktop names table with the Vehicle header", () => {
      const namesTable = root.querySelector<HTMLElement>('[data-testid="grid-names-table"]');
      expect(namesTable).not.toBeNull();
      expect(namesTable?.querySelector<HTMLElement>("th")?.textContent?.trim()).toBe("Vehicle");
    });

    it("renders the desktop day mirror wrapper", () => {
      expect(root.querySelector('[data-testid="grid-day-mirror"]')).not.toBeNull();
    });

    it("does not render any mobile-only rows", () => {
      expect(root.querySelectorAll('[data-testid^="grid-mobile-"]').length).toBe(0);
    });
  });
});
