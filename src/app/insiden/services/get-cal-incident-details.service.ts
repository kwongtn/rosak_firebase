import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface GetCalIncidentDetailsResponseElem {
    details: string;
}

export interface GetCalIncidentDetailsResponse {
    calendarIncidents: GetCalIncidentDetailsResponseElem[];
}

@Injectable({
    providedIn: "root",
})
export class GetCalIncidentDetailsService extends Query<GetCalIncidentDetailsResponse> {
    override document = gql`
        query (
            $filters: CalendarIncidentFilter
            $order: CalendarIncidentOrder
        ) {
            calendarIncidents(filters: $filters, order: $order) {
              id
                details
            }
        }
    `;
}
