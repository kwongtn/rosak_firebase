import { TestBed } from "@angular/core/testing";

import { MarkReadService } from "../mark-read.service";

describe("MarkReadService", () => {
    let service: MarkReadService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(MarkReadService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
