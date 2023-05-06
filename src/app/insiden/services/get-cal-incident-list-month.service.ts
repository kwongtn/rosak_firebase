import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface GetCalendarIncidentListMonthResponseElem {
    id: string;
    startDatetime: string;
    endDatetime: string | null;
    severity: "CRITICAL" | "MINOR" | "MILESTONE";
}

export interface GetCalendarIncidentListMonthResponse {
    calendarIncidents: GetCalendarIncidentListMonthResponseElem[];
}

@Injectable({
    providedIn: "root",
})
export class GetCalIncidentListMonthService extends Query<GetCalendarIncidentListMonthResponse> {
    override document = gql`
        query ($filters: CalendarIncidentFilter) {
            calendarIncidents(filters: $filters) {
                id
                startDatetime
                endDatetime
                severity
            }
        }
    `;
}
