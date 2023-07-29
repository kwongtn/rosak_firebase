import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

interface Media {
    width: number;
    height: number;
    file: {
        url: string;
    };
}

export interface MediaRelayResponse {
    mediasGroupByPeriod: {
        type: "DAY" | "MONTH" | "YEAR";
        dateKey: string;
        count: number;
        medias: Media[];
    }[];
}

@Injectable({
    providedIn: "root",
})
export class GetMediasService extends Query<MediaRelayResponse> {
    override document = gql`
        query ($type: DateGroupings!) {
            mediasGroupByPeriod(type: $type) {
                type
                dateKey
                count
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
