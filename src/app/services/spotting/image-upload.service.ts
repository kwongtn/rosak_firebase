
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
    $pendingUploadCount: BehaviorSubject<number> = new BehaviorSubject<number>(0);

    constructor() {
        return;
    }

    addToQueue(spottingId: number, file: File) {
        this.pendingUploads.push({ spottingId, file });
        this.$pendingUploadCount.next(this.pendingUploads.length);

        console.log("Pending uploads");
        console.log(this.pendingUploads);
    }
}
