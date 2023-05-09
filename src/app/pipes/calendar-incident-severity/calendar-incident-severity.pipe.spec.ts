import {
    CalendarIncidentSeverityPipe,
} from "./calendar-incident-severity.pipe";

describe("CalendarIncidentSeverityPipe", () => {
    it("create an instance", () => {
        const pipe = new CalendarIncidentSeverityPipe();
        expect(pipe).toBeTruthy();
    });
});
