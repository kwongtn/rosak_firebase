import { TestBed } from "@angular/core/testing";

import {
    GetCalIncidentListMonthService,
} from "./get-cal-incident-list-month.service";

describe("GetCalIncidentListMonthService", () => {
    let service: GetCalIncidentListMonthService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetCalIncidentListMonthService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
