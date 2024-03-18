import { gql, Mutation } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface RequestVerificationCodeResponse {
  requestVerificationCode: {
    code: number;
  }
}

@Injectable({
    providedIn: "root"
})
export class GetCodeService extends Mutation<RequestVerificationCodeResponse> {
    override document = gql`
      mutation {
        requestVerificationCode {
          code
        }
      }
  `;
}
