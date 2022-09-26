import { TestBed } from "@angular/core/testing";

import { ConsoleEventsGqlService } from "./events-gql.service";

describe("ConsoleEventsGqlService", () => {
    let service: ConsoleEventsGqlService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(ConsoleEventsGqlService);
    });

    it("should be created", () => {
        expect(service).toBeTruthy();
    });
});
