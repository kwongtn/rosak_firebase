import { TestBed } from "@angular/core/testing";

import { GtfsStaticStateService } from "./gtfs-static-state.service";

describe("GtfsStaticStateService", () => {
    let service: GtfsStaticStateService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GtfsStaticStateService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
