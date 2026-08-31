import { ApplicationRef } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SpottingLineDataStore } from "./spotting-line-data.store";
import { VEHICLE_TYPES_QUERY } from "./spotting.queries";

function isVehicleTypesRequest(r: { method: string; body: { query: string } }): boolean {
  return r.method === "POST" && r.body.query.includes("VehicleTypesByLine");
}

describe("SpottingLineDataStore", () => {
  let store: SpottingLineDataStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SpottingLineDataStore,
        provideHttpClientTesting(),
        provideZonelessChangeDetection(),
      ],
    });
    store = TestBed.inject(SpottingLineDataStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("memoizes the resource per lineId and does not re-request the same line", async () => {
    // First call for L1 creates the resource and issues exactly one request.
    const r1a = store.vehicleTypesFor("L1");
    await Promise.resolve();
    TestBed.inject(ApplicationRef).tick();
    const req1 = httpMock.expectOne(isVehicleTypesRequest);
    expect(req1).toBeTruthy();
    req1.flush({ data: { vehicleTypes: [{ id: "vt1", displayName: "Type 1", vehicles: [] }] } });
    await Promise.resolve();
    TestBed.inject(ApplicationRef).tick();
    expect(r1a.data()?.vehicleTypes?.[0]?.id).toBe("vt1");

    // Second call for the same lineId returns the identical (cached) wrapper — no new request.
    const r1b = store.vehicleTypesFor("L1");
    expect(r1b).toBe(r1a);
    expect(httpMock.match((r) => r.method === "POST").length).toBe(0);

    // A new lineId issues a fresh request and returns a distinct wrapper.
    const r2 = store.vehicleTypesFor("L2");
    expect(r2).not.toBe(r1a);
    await Promise.resolve();
    TestBed.inject(ApplicationRef).tick();
    const req2 = httpMock.expectOne(isVehicleTypesRequest);
    expect(req2).toBeTruthy();
    req2.flush({ data: { vehicleTypes: [] } });
    await Promise.resolve();
    TestBed.inject(ApplicationRef).tick();
  });

  it("uses the VEHICLE_TYPES_QUERY with the requested lineId variable", async () => {
    const resource = store.vehicleTypesFor("LINE-42");
    await Promise.resolve();
    TestBed.inject(ApplicationRef).tick();
    const req = httpMock.expectOne(isVehicleTypesRequest);
    expect(req.request.body.query).toBe(VEHICLE_TYPES_QUERY);
    expect(req.request.body.variables).toEqual({ lineId: "LINE-42" });
    req.flush({ data: { vehicleTypes: [] } });
    await Promise.resolve();
    TestBed.inject(ApplicationRef).tick();
  });
});
