import { AuthService } from "src/app/services/auth/auth.service";

import { Component } from "@angular/core";

import { GetCodeService } from "./services/get-code.service";

const VERIFICATION_COUNTDOWN= 60;

@Component({
    selector: "verification-code-card",
    templateUrl: "./verification-code-card.component.html",
    styleUrl: "./verification-code-card.component.scss",
})
export class VerificationCodeCardComponent {
    verificationCode: number| undefined = undefined;
    codeExpiry: Date| undefined = undefined;

    countdown: number = VERIFICATION_COUNTDOWN;

    interval: NodeJS.Timeout | undefined = undefined;

    isLoading = false;

    constructor(
      public authService: AuthService,
      public getCodeService: GetCodeService,
    ) {
        return;
    }

    async getCode(){
        const authKey = await this.authService.getIdToken();

        this.isLoading = true;
        this.getCodeService.mutate({}, {
            context: {
                headers: {
                    "firebase-auth-key": authKey,
                },
            },
            fetchPolicy: "network-only",
        }).subscribe((res) => {
            this.verificationCode = res.data?.requestVerificationCode.code;
            this.codeExpiry = new Date(new Date().getTime() + 6e4);
            this.isLoading = false;

            this.interval = setInterval(() => {
                this.countdown--;

                if(this.countdown === 0){
                    clearInterval(this.interval);
    
                    this.verificationCode = undefined;
                    this.codeExpiry = undefined;
                    this.countdown = VERIFICATION_COUNTDOWN;
                }
            }, 1000);
            
        });
    }

}
