import { TestBed } from "@angular/core/testing";

import { GetEventsService } from "../get-events.service";

describe("GetEventsService", () => {
    let service: GetEventsService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetEventsService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
