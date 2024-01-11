import { TestBed } from "@angular/core/testing";

import { GetDataGqlService } from "./get-data-gql.service";

describe("GetDataGqlService", () => {
    let service: GetDataGqlService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetDataGqlService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
