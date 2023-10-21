import { gql, Mutation } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface UpdateUserServiceResponse {
    updateUser: {
        nickname: string;
    };
}

@Injectable({
    providedIn: "root",
})
export class UpdateUserService extends Mutation<UpdateUserServiceResponse> {
    override document = gql`
        mutation ($data: UserInput!) {
            updateUser(input: $data) {
                nickname
            }
        }
    `;
}
