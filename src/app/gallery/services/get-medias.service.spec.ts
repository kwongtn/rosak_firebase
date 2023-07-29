import { TestBed } from "@angular/core/testing";

import { GetMediasService } from "./get-medias.service";

describe("GetMediasService", () => {
    let service: GetMediasService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetMediasService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
