import { BehaviorSubject } from "rxjs";

import { Injectable } from "@angular/core";

import { ToastService } from "../toast/toast.service";

@Injectable({
    providedIn: "root",
})
export class ImageUploadService {
    pendingUploads: {
        spottingId: number;
        file: File;
    }[] = [];
    $pendingUploadCount: BehaviorSubject<number> = new BehaviorSubject<number>(
        0
    );
    $totalUploadCount: BehaviorSubject<number> = new BehaviorSubject<number>(0);
    $percentUploaded: BehaviorSubject<number> = new BehaviorSubject<number>(0);

    constructor() {
        return;
    }

    refreshCounts(addCount: number = 0) {
        if (addCount > 0) {
            this.$totalUploadCount.next(
                this.$totalUploadCount.getValue() + addCount
            );
        }

        const totalUploadCount = this.$totalUploadCount.getValue();
        this.$pendingUploadCount.next(this.pendingUploads.length);
        this.$percentUploaded.next(
            ((totalUploadCount - this.$pendingUploadCount.getValue()) * 100) /
                totalUploadCount
        );

        if (this.pendingUploads.length === 0) {
            this.toastService.addMessage(
                "Uploads complete. You may now close this tab.",
                "success"
            );
        }
    }

    addToQueue(spottingId: number, file: File) {
        this.pendingUploads.push({ spottingId, file });
        this.refreshCounts(1);

        console.log("Pending uploads");
        console.log(this.pendingUploads);
    }
}
