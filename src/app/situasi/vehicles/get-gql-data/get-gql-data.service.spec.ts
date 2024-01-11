import { TestBed } from "@angular/core/testing";

import { GetGqlDataService } from "./get-gql-data.service";

describe("GetGqlDataService", () => {
    let service: GetGqlDataService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetGqlDataService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
