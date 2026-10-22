import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { describe, expect, it } from "vitest";

import type { VehicleIncident } from "../../data/spotting.queries";
import { IncidentTimelineComponent } from "./incident-timeline.component";

function incident(order: number, title: string, brief: string | null): VehicleIncident {
  return { order, date: "2026-10-01", severity: "STATUS", title, brief, isLast: false };
}

describe("IncidentTimelineComponent", () => {
  it("renders an incident without a brief as its title alone (the brief is nullable)", async () => {
    await TestBed.configureTestingModule({
      imports: [IncidentTimelineComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(IncidentTimelineComponent);
    fixture.componentRef.setInput("vehicleId", "103");
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(() => true)
      .flush({
        data: {
          vehicleIncidents: [
            incident(2, "Back in service", "Seen on the 07:10 run."),
            incident(1, "Withdrawn", null),
          ],
        },
      });
    await fixture.whenStable();

    const items = [...(fixture.nativeElement as HTMLElement).querySelectorAll("li")];
    expect(items.map((item) => item.querySelector(".font-medium")?.textContent)).toEqual([
      "Withdrawn",
      "Back in service",
    ]);
    expect(items.map((item) => item.querySelector("p")?.textContent ?? null)).toEqual([
      null,
      "Seen on the 07:10 run.",
    ]);
    httpMock.verify();
    fixture.destroy();
  });
});
