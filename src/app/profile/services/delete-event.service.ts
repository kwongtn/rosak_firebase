import { gql, Mutation } from "apollo-angular";
import { GenericMutationReturn } from "src/app/models/mutation";

import { Injectable } from "@angular/core";

@Injectable({
    providedIn: "root",
})
export class DeleteEventService extends Mutation<GenericMutationReturn> {
    override document = gql`
        mutation ($deleteEventInput: DeleteEventInput!) {
            deleteEvent(input: $deleteEventInput) {
                ok
            }
        }
    `;
}
