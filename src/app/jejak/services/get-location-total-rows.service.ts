import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface LocationCount {
    locationsCount: number;
}

@Injectable({
    providedIn: "root",
})
export class GetLocationTotalRowsService extends Query<LocationCount> {
    override document = gql`
        query ($filters: LocationFilter) {
            locationsCount(filters: $filters)
        }
    `;
}
