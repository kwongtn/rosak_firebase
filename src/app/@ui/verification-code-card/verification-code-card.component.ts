import { AuthService } from "src/app/services/auth.service";

import { ChangeDetectorRef, Component } from "@angular/core";

import { firstValueFrom } from "rxjs";
import { GetCodeService } from "./services/get-code.service";

const VERIFICATION_COUNTDOWN = 60;

@Component({
    selector: "verification-code-card",
    templateUrl: "./verification-code-card.component.html",
    styleUrl: "./verification-code-card.component.scss",
})
export class VerificationCodeCardComponent {
    verificationCode: number | undefined = undefined;
    codeExpiry: Date | undefined = undefined;

    countdown: number = VERIFICATION_COUNTDOWN;

    interval: NodeJS.Timeout | undefined = undefined;

    isLoading = false;

    constructor(
        public authService: AuthService,
        public getCodeService: GetCodeService,
        private cdr: ChangeDetectorRef
    ) {
        return;
    }

    async getCode() {
        const authKey = await this.authService.getIdToken();
        this.isLoading = true;

        firstValueFrom(
            this.getCodeService.mutate(
                {},
                {
                    context: {
                        headers: {
                            "firebase-auth-key": authKey,
                        },
                    },
                    fetchPolicy: "network-only",
                }
            )
        )
            .then((res) => {
                this.verificationCode = res.data?.requestVerificationCode.code;
                this.codeExpiry = new Date(new Date().getTime() + 6e4);

                this.interval = setInterval(() => {
                    this.countdown--;

                    if (this.countdown === 0) {
                        clearInterval(this.interval);

                        this.verificationCode = undefined;
                        this.codeExpiry = undefined;
                        this.countdown = VERIFICATION_COUNTDOWN;
                    }
                    this.cdr.detectChanges();
                }, 1000);
            })
            .finally(() => {
                this.isLoading = false;
                this.cdr.detectChanges();
            });
    }
}
