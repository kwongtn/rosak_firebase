import { TestBed } from "@angular/core/testing";

import {
    GetCalIncidentDetailsService,
} from "./get-cal-incident-details.service";

describe("GetCalIncidentDetailsService", () => {
    let service: GetCalIncidentDetailsService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetCalIncidentDetailsService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
