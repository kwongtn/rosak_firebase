import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface BusData {
    buses: {
        id: string;
        identifier: string;
    }[];
}

@Injectable({
    providedIn: "root",
})
export class GetBusesService extends Query<BusData> {
    override document = gql`
        query ($busPagination: OffsetPaginationInput, $busOrder: BusOrder) {
            buses(pagination: $busPagination, order: $busOrder) {
                id
                identifier
            }
        }
    `;
}
