import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface GetCalendarIncidentListMonthResponseElem {
    count: number;
    date: string;
    isLongTerm: boolean;
    severity: "CRITICAL" | "MINOR" | "MILESTONE";
}

export interface GetCalendarIncidentListMonthResponse {
    calendarIncidentsBySeverityCount: GetCalendarIncidentListMonthResponseElem[];
}

@Injectable({
    providedIn: "root",
})
export class GetCalIncidentListMonthService extends Query<GetCalendarIncidentListMonthResponse> {
    override document = gql`
        query ($startDate: Date!, $endDate: Date!, $groupBy: GroupByEnum!) {
            calendarIncidentsBySeverityCount(
                startDate: $startDate
                endDate: $endDate
                groupBy: $groupBy
            ) {
                count
                date
                isLongTerm
                severity
            }
        }
    `;
}
