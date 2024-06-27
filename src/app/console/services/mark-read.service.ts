import { Apollo, gql } from "apollo-angular";
import { ReCaptchaV3Service } from "ng-recaptcha";
import { firstValueFrom } from "rxjs";
import { AuthService } from "src/app/services/auth.service";

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
    };
}

@Injectable({
    providedIn: "any",
})
export class MarkReadService {
    constructor(
        private authService: AuthService,
        private apollo: Apollo,
        private recaptchaV3Service: ReCaptchaV3Service
    ) {
        return;
    }

    async markAsRead(eventIds: string[]) {
        const $result = this.apollo.mutate<MarkEventAsReadResult>({
            mutation: MARK_AS_READ,
            variables: {
                input: {
                    eventIds: eventIds,
                },
            },
            context: {
                headers: {
                    "g-recaptcha-response": await firstValueFrom(
                        this.recaptchaV3Service.execute("markAsRead")
                    ),
                    "firebase-auth-key": await this.authService.getIdToken(),
                },
            },
        });

        return firstValueFrom($result);
    }
}
