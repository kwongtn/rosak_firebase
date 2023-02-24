import { TestBed } from "@angular/core/testing";

import { GetBusesService } from "./get-buses.service";

describe("GetBusesService", () => {
    let service: GetBusesService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetBusesService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
