import { TestBed } from "@angular/core/testing";

import { GetCalIncidentListMinService } from "./get-cal-incident-list-min.service";

describe("GetCalIncidentListMinService", () => {
    let service: GetCalIncidentListMinService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetCalIncidentListMinService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
