import { TestBed } from "@angular/core/testing";

import {
    GetLinesAndVehiclesGqlService,
} from "../get-lines-vehicles-gql.service";

describe("GetLinesAndVehiclesGqlService", () => {
    let service: GetLinesAndVehiclesGqlService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(GetLinesAndVehiclesGqlService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
