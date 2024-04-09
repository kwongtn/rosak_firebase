import { TestBed } from "@angular/core/testing";

import { GetCodeService } from "./get-code.service";

describe("GetCodeService", () => {
    let service: GetCodeService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetCodeService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
