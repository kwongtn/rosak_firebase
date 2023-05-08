import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface GetCalendarIncidentListMinResponseElem {
    id: string;
    startDatetime: string;
    endDatetime: string | null;
    severity: "CRITICAL" | "MINOR" | "MILESTONE";
    title: string;
    brief: string;
    impactFactor: number;
    lines: {
        // id: string;
        // code: string;
        displayName: string;
        displayColor: string;
    }[];
    vehicles: {
        // id: string;
        identificationNo: string;
    }[];
    stations: {
        // id: string;
        displayName: string;
    }[];
    categories: {
        name: string;
    };
}

export interface GetCalendarIncidentListMinResponse {
    calendarIncidents: GetCalendarIncidentListMinResponseElem[];
}
@Injectable({
    providedIn: "root",
})
export class GetCalIncidentListMinService extends Query<GetCalendarIncidentListMinResponse> {
    override document = gql`
        query ($filters: CalendarIncidentFilter) {
            calendarIncidents(filters: $filters) {
                id
                startDatetime
                endDatetime
                severity
                title
                brief
                impactFactor
                lines {
                    # id
                    # code
                    displayName
                    displayColor
                }
                vehicles {
                    # id
                    identificationNo
                }
                stations {
                    # id
                    displayName
                }
                categories {
                    name
                }
            }
        }
    `;
}
