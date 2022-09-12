import { TestBed } from "@angular/core/testing";

import { SpottingStorageService } from "./storage.service";

describe("StorageService", () => {
    let service: SpottingStorageService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(SpottingStorageService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
