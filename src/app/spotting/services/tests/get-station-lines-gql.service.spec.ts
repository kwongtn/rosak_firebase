import { TestBed } from "@angular/core/testing";

import { GetStationLinesGqlService } from "../get-station-lines-gql.service";

describe("GetStationLinesGqlService", () => {
    let service: GetStationLinesGqlService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetStationLinesGqlService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
