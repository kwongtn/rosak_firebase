import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface LineVehiclesChartographySource {
    id: string;
    name: string;
    description: string;
    officialSite: null | string;
}

export interface GetLineVehiclesResponse {
    lines: {
        id: string;
        code: string;
        displayName: string;
        chartographySources: LineVehiclesChartographySource[];
        vehicles: {
            id: string;
        }[];
    }[];
}

@Injectable({
    providedIn: "root",
})
export class GetGqlDataService extends Query<GetLineVehiclesResponse> {
    override document = gql`
        query GetLinesAndVehicles($lineFilter: LineFilter) {
            lines(filters: $lineFilter) {
                id
                code
                displayName
                chartographySources {
                    id
                    name
                    description
                    officialSite
                }
                vehicles {
                    id
                }
            }
        }
    `;
}
