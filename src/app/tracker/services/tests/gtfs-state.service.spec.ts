import { TestBed } from "@angular/core/testing";

import { GtfsStateService } from "../gtfs-state.service";

describe("GtfsStateService", () => {
    let service: GtfsStateService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GtfsStateService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
