import { TestBed } from "@angular/core/testing";

import { GetCalIncidentMediasService } from "./get-cal-incident-medias.service";

describe("GetCalIncidentMediasService", () => {
    let service: GetCalIncidentMediasService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetCalIncidentMediasService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
