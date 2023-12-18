import { ErrorHandler, Injectable } from "@angular/core";

import { ToastService } from "./services/toast/toast.service";

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
    constructor(public toastService: ToastService) {}
    handleError(error: any): void {
        const chunkFailedMessage = /Loading chunk [\d]+ failed/;

        if (chunkFailedMessage.test(error.message)) {
            this.toastService.addToast(
                "New app version available!",
                "A new version of the app is available. Reloading the page in 3..2..1..",
                "info"
            );
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        }
    }
}
