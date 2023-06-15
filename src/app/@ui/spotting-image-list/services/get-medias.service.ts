import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface MediaResponse {
    events: {
        medias: {
            file: {
                url: string;
            };
        }[];
    }[];
}

@Injectable({
    providedIn: "root",
})
export class GetMediasService extends Query<MediaResponse> {
    override document = gql`
        query ($filters: EventFilter) {
            events(filters: $filters) {
                medias {
                    file {
                        url
                    }
                }
            }
        }
    `;
}
