import { TestBed } from "@angular/core/testing";

import { ImageCompressionService } from "./image-compression.service";

describe("ImageCompressionService", () => {
    let service: ImageCompressionService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(ImageCompressionService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
