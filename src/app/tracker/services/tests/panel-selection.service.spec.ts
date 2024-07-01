import { TestBed } from "@angular/core/testing";

import { PanelSelectionService } from "../panel-selection.service";

describe("PanelSelectionService", () => {
    let service: PanelSelectionService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(PanelSelectionService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
