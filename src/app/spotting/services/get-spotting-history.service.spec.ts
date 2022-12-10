import { TestBed } from "@angular/core/testing";

import { GetSpottingHistoryService } from "./get-spotting-history.service";

describe("GetSpottingHistoryService", () => {
    let service: GetSpottingHistoryService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetSpottingHistoryService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
