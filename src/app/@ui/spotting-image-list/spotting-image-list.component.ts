import { NzImageService } from "ng-zorro-antd/image";
import { Subscription } from "rxjs";
import { getThumbnail } from "src/app/@util/imgur";

import { Component, Input, OnDestroy, OnInit } from "@angular/core";

import { ImageFile } from "../spotting/form-upload/form-upload.component";
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

    imageUrls: ImageUrls[] = [];

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
                this.imageUrls = data.events[0].medias.map((media) => {
                    return {
                        fullSize: media.file.url,
                        preview: getThumbnail(media.file.url, "m"),
                    };
                });

                if (this.imageUrls.length === 0) {
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
                this.imageUrls.map((val) => {
                    return { src: val.fullSize };
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
