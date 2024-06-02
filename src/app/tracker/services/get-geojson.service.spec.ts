import { TestBed } from "@angular/core/testing";

import { GetGeojsonService } from "./get-geojson.service";

describe("GetGeojsonService", () => {
    let service: GetGeojsonService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetGeojsonService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
