import { TestBed } from "@angular/core/testing";

import { DeleteEventService } from "./delete-event.service";

describe("DeleteEventService", () => {
    let service: DeleteEventService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(DeleteEventService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
