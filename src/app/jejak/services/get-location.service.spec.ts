import { TestBed } from "@angular/core/testing";

import { GetLocationService } from "./get-location.service";

describe("GetLocationService", () => {
    let service: GetLocationService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetLocationService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
