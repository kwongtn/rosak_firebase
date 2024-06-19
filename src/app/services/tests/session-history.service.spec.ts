import { TestBed } from "@angular/core/testing";

import { SessionHistoryService } from "./session-history.service";

describe("SessionHistoryService", () => {
    let service: SessionHistoryService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(SessionHistoryService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
