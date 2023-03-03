import { TestBed } from "@angular/core/testing";

import { GetLocationTotalRowsService } from "./get-location-total-rows.service";

describe("GetLocationTotalRowsService", () => {
    let service: GetLocationTotalRowsService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetLocationTotalRowsService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
