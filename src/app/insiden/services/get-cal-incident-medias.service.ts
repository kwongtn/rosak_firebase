import { gql, Query } from "apollo-angular";
import { Media } from "src/app/gallery/services/get-medias.service";

import { Injectable } from "@angular/core";

export interface GetCalIncidentMediasResponseElem {
    medias: Media[];
}

export interface GetCalIncidentMediasResponse {
    calendarIncidents: GetCalIncidentMediasResponseElem[];
}

@Injectable({
    providedIn: "root",
})
export class GetCalIncidentMediasService extends Query<GetCalIncidentMediasResponse> {
    override document = gql`
        query ($filters: CalendarIncidentFilter) {
            calendarIncidents(filters: $filters) {
                medias {
                    width
                    height
                    file {
                        url
                    }
                }
            }
        }
    `;
}
