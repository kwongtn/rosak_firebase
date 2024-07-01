import { TestBed } from "@angular/core/testing";

import { SpottingStorageService } from "../spotting-storage.service";

describe("SpottingStorageService", () => {
    let service: SpottingStorageService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(SpottingStorageService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
