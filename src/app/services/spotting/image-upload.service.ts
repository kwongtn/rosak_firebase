import { BehaviorSubject, firstValueFrom } from "rxjs";
import { catchError } from "rxjs/operators";
import {
    ImageFile,
} from "src/app/@ui/spotting/form-upload/form-upload.component";
import { environment } from "src/environments/environment";

import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { PromisePool } from "@supercharge/promise-pool";

import { AuthService } from "../auth/auth.service";
import { ToastService } from "../toast/toast.service";

interface IPendingUpload {
    spottingId: number | string;
    file: ImageFile;
}

@Injectable({
    providedIn: "root",
})
export class ImageUploadService {
    pendingUploads: IPendingUpload[] = [];
    $pendingUploadCount: BehaviorSubject<number> = new BehaviorSubject<number>(
        0
    );
    $totalUploadCount: BehaviorSubject<number> = new BehaviorSubject<number>(0);
    $percentUploaded: BehaviorSubject<number> = new BehaviorSubject<number>(0);

    uploadIntervalObj: NodeJS.Timer | undefined = undefined;
    isUploading: boolean = false;

    constructor(
        private toastService: ToastService,
        private http: HttpClient,
        public authService: AuthService
    ) {}

    async triggerUpload(): Promise<void> {
        const currentUploads: IPendingUpload[] = [];
        for (const pending of this.pendingUploads) {
            currentUploads.push(pending);
        }
        this.pendingUploads = [];

        await PromisePool.withConcurrency(environment.upload.concurrency)
            .for(currentUploads)
            .process(({ spottingId, file }) => {
                this.isUploading = true;
                const input = new FormData();
                input.append("spotting_event_id", spottingId.toString());

                if (file.toCompress && !file.isCompressed) {
                    this.pendingUploads.push({
                        spottingId,
                        file,
                    });
                    return;
                } else {
                    input.append("image", file.file);
                }

                return Promise.all([this.authService.getIdToken()]).then(
                    ([firebaseAuthKey]) => {
                        const httpPost = this.http
                            .post(
                                `${environment.backendUrl}spotting_upload/`,
                                input,
                                {
                                    headers: {
                                        "Firebase-Auth-Key":
                                            firebaseAuthKey as string,
                                    },
                                }
                            )
                            .pipe(
                                catchError((err) => {
                                    // Recover if there is any error
                                    this.pendingUploads.push({
                                        spottingId,
                                        file,
                                    });
                                    throw new Error(err);
                                })
                            );

                        return firstValueFrom(httpPost).then((res) => {
                            this.onUploaded();
                            return res;
                        });
                    }
                );
            })
            .then(() => {
                this.addCounts();
                this.isUploading = false;
            });
    }

    onUploaded(): void {
        // Workaround to display correct upload information
        const totalUploadCount = this.$totalUploadCount.getValue();
        const pendingUpload = this.$pendingUploadCount.getValue() - 1;

        this.$pendingUploadCount.next(pendingUpload);
        this.$percentUploaded.next(
            ((totalUploadCount - pendingUpload) * 100) / totalUploadCount
        );
    }

    addCounts(addCount: number = 0) {
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
                "success",
                {
                    nzDuration: 10000,
                }
            );

            if (this.uploadIntervalObj) {
                clearInterval(this.uploadIntervalObj);
                this.uploadIntervalObj = undefined;
            }
        }
    }

    addToQueue(spottingId: number | string, file: ImageFile) {
        this.pendingUploads.push({ spottingId, file });
        this.addCounts(1);

        console.log("Pending uploads");
        console.log(this.pendingUploads);

        if (!this.uploadIntervalObj) {
            this.uploadIntervalObj = setInterval(() => {
                console.log("Interval");
                if (this.pendingUploads.length > 0 && !this.isUploading) {
                    this.triggerUpload();
                }
            }, 1000);
        }
    }
}
