import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

interface StationLinesResponse {
    stationLines: Array<{
        id: string;
        displayName: string;
        internalRepresentation: string;
    }>;
}

@Injectable({
    providedIn: "any",
})
export class GetStationLinesGqlService extends Query<StationLinesResponse> {
    override document = gql`
        query GetStationLines($stationLineFilter: StationLineFilter) {
            stationLines(filters: $stationLineFilter) {
                id
                displayName
                internalRepresentation
            }
        }
    `;
}
