import { NzImageService } from "ng-zorro-antd/image";
import { Subscription } from "rxjs";
import {
    ImageFile,
} from "src/app/@ui/spotting/form-upload/form-upload.component";

import { Component, Input, OnDestroy, OnInit } from "@angular/core";

import { GetMediasService } from "./services/get-medias.service";

interface ImageUrls {
    fullSize: string;
    preview: string;
}

@Component({
    selector: "ui-spotting-image-list",
    templateUrl: "./spotting-image-list.component.html",
    styleUrls: ["./spotting-image-list.component.scss"],
})
export class SpottingImageListComponent implements OnInit, OnDestroy {
    @Input() eventId!: string;
    @Input() isMine: boolean = false;

    // List of discord suffixes
    imageSrcs: string[] = [];

    subscription: Subscription | undefined = undefined;
    loading: boolean = true;

    pendingUploads: ImageFile[] = [];

    constructor(
        public getMediaService: GetMediasService,
        private nzImageService: NzImageService
    ) {
        return;
    }

    ngOnInit(): void {
        this.subscription = this.getMediaService
            .fetch({
                filters: {
                    id: this.eventId,
                },
            })
            .subscribe(({ data, loading }) => {
                console.log("Received data");
                console.log(data);
                this.imageSrcs = data.events[0].medias.map((media) => {
                    return media.discordSuffix;
                });

                if (this.imageSrcs.length === 0) {
                    this.loading = loading;
                }
            });
    }

    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
    }

    onViewImage(index: number): void {
        this.nzImageService
            .preview(
                this.imageSrcs.map((src) => {
                    return { src: `https://cdn.discordapp.com/attachments/${src}` };
                })
            )
            .switchTo(index);
    }

    markLoaded(): void {
        this.loading = false;
    }

    onImageChange(images: { [key: string]: ImageFile }) {
        this.pendingUploads = Object.values<ImageFile>(images).filter((val) => {
            return val != null;
        });
    }
}
