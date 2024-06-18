import { TestBed } from "@angular/core/testing";

import { GtfsRtStateService } from "../gtfs-rt-state.service";

describe("GtfsRtStateService", () => {
    let service: GtfsRtStateService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GtfsRtStateService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
