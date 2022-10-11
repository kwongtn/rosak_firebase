import { Apollo, gql } from "apollo-angular";
import { firstValueFrom } from "rxjs";
import { AuthService } from "src/app/services/auth/auth.service";

import { Injectable } from "@angular/core";

const MARK_AS_READ = gql`
    mutation ($input: MarkEventAsReadInput!) {
        markAsRead(input: $input) {
            ok
        }
    }
`;

interface MarkEventAsReadResult {
    markAsRead: {
        ok: boolean;
    }
}

@Injectable({
    providedIn: "any",
})
export class MarkReadService {
    constructor(private authService: AuthService, private apollo: Apollo) {
        return;
    }

    async markAsRead(eventIds: string[]) {
        const $result =  this.apollo.mutate<MarkEventAsReadResult>({
            mutation: MARK_AS_READ,
            variables: {
                input: {
                    eventIds: eventIds,
                },
            },
            context: {
                headers: {
                    "firebase-auth-key": await this.authService.getIdToken(),
                },
            },
        });

        return firstValueFrom($result);
    }
}
