import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { VehicleRow, VehicleType } from "../../data/spotting.queries";
import { LineStatusBoardComponent } from "./line-status-board.component";

function makeVehicle(identificationNo: string, overrides: Partial<VehicleRow>): VehicleRow {
  return {
    id: identificationNo,
    identificationNo,
    status: "IN_SERVICE",
    nickname: null,
    lastSpottingDate: null,
    lastSpottedAt: null,
    inServiceSince: null,
    spottingCount: 1,
    notes: null,
    incidentCount: 0,
    wheelStatus: null,
    ...overrides,
  };
}

function render(vehicles: VehicleRow[]): string {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(LineStatusBoardComponent);
  const type = { id: "1", vehicles } as VehicleType;
  fixture.componentRef.setInput("vehicleTypes", [type]);
  fixture.detectChanges();
  return fixture.nativeElement.textContent;
}

describe("LineStatusBoardComponent — Most Recently Spotted", () => {
  it("breaks a same-day lastSpottingDate tie with lastSpottedAt, regardless of list order", () => {
    const day = "2026-10-18";
    const earlier = makeVehicle("110", {
      lastSpottingDate: day,
      lastSpottedAt: "2026-10-18T14:50:55.986882",
    });
    const later = makeVehicle("151", {
      lastSpottingDate: day,
      lastSpottedAt: "2026-10-18T15:14:56.045999",
    });

    for (const order of [
      [earlier, later],
      [later, earlier],
    ]) {
      TestBed.resetTestingModule();
      const text = render(order);
      expect(text).toContain("151");
      expect(text).not.toContain("110");
    }
  });

  it("prefers the later lastSpottingDate over a later lastSpottedAt", () => {
    const backfilled = makeVehicle("201", {
      lastSpottingDate: "2026-10-17",
      lastSpottedAt: "2026-10-19T09:00:00",
    });
    const current = makeVehicle("202", {
      lastSpottingDate: "2026-10-18",
      lastSpottedAt: "2026-10-18T10:00:00",
    });

    const text = render([backfilled, current]);
    expect(text).toContain("202");
    expect(text).not.toContain("201");
  });
});
