import { Component, inject } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InsidenReferenceStore } from "./insiden-reference.store";
import { INSIDEN_REFERENCE_QUERY } from "./insiden.queries";

@Component({
  selector: "test-host",
  template: `<span>{{ store.lineOptions().length }}</span>`,
})
class TestHost {
  readonly store = inject(InsidenReferenceStore);
}

describe("InsidenReferenceStore", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("is a singleton and issues exactly one reference request", async () => {
    const a = TestBed.inject(InsidenReferenceStore);
    const b = TestBed.inject(InsidenReferenceStore);
    expect(a).toBe(b);

    const fixture = TestBed.createComponent(TestHost);
    expect(fixture.componentInstance.store).toBe(a);
    fixture.detectChanges();

    const requests = httpMock.match((r) => r.method === "POST");
    expect(requests.length).toBe(1);
    expect(requests[0].request.body).toMatchObject({ query: INSIDEN_REFERENCE_QUERY });
    requests[0].flush({
      data: {
        lines: [
          {
            id: "L1",
            code: "KJL",
            displayName: "Kelana Jaya",
            vehicleTypes: [
              {
                id: "VT1",
                displayName: "4-car",
                vehicles: [{ id: "V1", identificationNo: "KJL-101" }],
              },
            ],
          },
        ],
        stations: [{ id: "S1", displayName: "KL Sentral", lines: [{ id: "L1", code: "KJL" }] }],
        calendarIncidentCategories: [{ id: "C1", name: "Delay" }],
      },
    });
    await fixture.whenStable();

    expect(a.lineOptions()).toEqual([{ id: "L1", label: "KJL — Kelana Jaya" }]);
    expect(a.vehicleOptions()).toEqual([{ id: "V1", label: "KJL-101", parentCodes: ["KJL"] }]);
    expect(a.vehicleParentCodes().get("V1")).toEqual(["KJL"]);
    expect(a.linesById().get("L1")?.code).toBe("KJL");
    expect(a.stationOptions()).toEqual([{ id: "S1", label: "KL Sentral", parentCodes: ["KJL"] }]);
    expect(a.categoryOptions()).toEqual([{ id: "C1", label: "Delay" }]);
  });

  it("flattens vehicles across multiple lines and dedupes by id", async () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const [req] = httpMock.match((r) => r.method === "POST");
    req.flush({
      data: {
        lines: [
          {
            id: "L1",
            code: "KJL",
            displayName: "Kelana Jaya",
            vehicleTypes: [
              {
                id: "VT1",
                displayName: "4-car",
                vehicles: [
                  { id: "V1", identificationNo: "KJL-101" },
                  { id: "V2", identificationNo: "KJL-102" },
                ],
              },
            ],
          },
          {
            id: "L2",
            code: "MRL",
            displayName: "MRT Putrajaya",
            vehicleTypes: [
              {
                id: "VT2",
                displayName: "4-car",
                // V1 shared across both lines — must appear once with both parent codes.
                vehicles: [
                  { id: "V1", identificationNo: "KJL-101" },
                  { id: "V3", identificationNo: "MRL-201" },
                ],
              },
            ],
          },
        ],
        stations: [],
        calendarIncidentCategories: [],
      },
    });
    await fixture.whenStable();

    const store = fixture.componentInstance.store;
    const byId = new Map(store.vehicleOptions().map((o) => [o.id, o]));
    expect(byId.size).toBe(3);
    expect(byId.get("V1")?.parentCodes?.sort()).toEqual(["KJL", "MRL"]);
    expect(byId.get("V2")?.parentCodes).toEqual(["KJL"]);
    expect(byId.get("V3")?.parentCodes).toEqual(["MRL"]);
  });
});
