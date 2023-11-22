import { TestBed } from "@angular/core/testing";

import { BuildInfoService } from "./build-info.service";

describe("BuildInfoService", () => {
    let service: BuildInfoService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(BuildInfoService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
