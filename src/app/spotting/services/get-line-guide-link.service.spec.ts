import { TestBed } from "@angular/core/testing";

import { GetLineGuideLinkService } from "./get-line-guide-link.service";

describe("GetLineGuideLinkService", () => {
    let service: GetLineGuideLinkService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetLineGuideLinkService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
