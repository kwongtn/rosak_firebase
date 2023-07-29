import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

interface MediaRelayResponseEdge {
    node: {
        width: number;
        height: number;
        created: string;
        file: {
            url: string;
        };
    };
}

export interface MediaRelayResponse {
    medias: {
        totalCount: number;
        pageInfo: {
            startCursor: string;
            endCursor: string;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
        edges: MediaRelayResponseEdge[];
    };
}

@Injectable({
    providedIn: "root",
})
export class GetMediasService extends Query<MediaRelayResponse> {
    override document = gql`
        query ($order: MediaOrder, $before: String, $after: String) {
            medias(order: $order, before: $before, after: $after) {
                totalCount
                pageInfo {
                    startCursor
                    endCursor
                    hasNextPage
                    hasPreviousPage
                }
                edges {
                    node {
                        width
                        height
                        created
                        file {
                            name
                            url
                        }
                    }
                }
            }
        }
    `;
}
