import { BehaviorSubject } from "rxjs";

import { Injectable } from "@angular/core";

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
    }

    addToQueue(spottingId: number, file: File) {
        this.pendingUploads.push({ spottingId, file });
        this.refreshCounts(1);

        console.log("Pending uploads");
        console.log(this.pendingUploads);
    }
}
