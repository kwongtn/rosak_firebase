import { firstValueFrom } from "rxjs";
import { filter } from "rxjs/operators";

import { Injectable } from "@angular/core";
import { SwUpdate, VersionReadyEvent } from "@angular/service-worker";

import { ToastService } from "../toast/toast.service";

@Injectable({
    providedIn: "root",
})
export class UpdateService {
    constructor(public swUpdate: SwUpdate, toastService: ToastService) {
        const updatesAvailable = swUpdate.versionUpdates.pipe(
            filter(
                (evt): evt is VersionReadyEvent => evt.type === "VERSION_READY"
            )
        );

        firstValueFrom(updatesAvailable).then((value) => {
            toastService.addToast({
                severity: "primary",
                summary: "New version available",
                content: "Reload to update to the new version.",
            });
        });
    }
}
