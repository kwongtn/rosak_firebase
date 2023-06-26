import { NzImageService } from "ng-zorro-antd/image";
import { Subscription } from "rxjs";

import { Component, Input, OnDestroy, OnInit } from "@angular/core";

import { GetMediasService } from "./services/get-medias.service";

type MediaSizes = "s" | "b" | "t" | "m" | "l" | "h";
interface ImageUrls {
    fullSize: string;
    preview: string;
}

function getFilename(url: string): string {
    const urlParts = url.split("/");
    const fileName = urlParts[urlParts.length - 1];
    return fileName.split(".")[fileName.split(".").length - 2];
}

/**
 * Get the smaller version of an image on Imgur
 * https://thomas.vanhoutte.be/miniblog/imgur-thumbnail-trick/
 * 
 * So if your image URL is https://i.imgur.com/9ZC02Os.jpg, 
 * you simply add the l to the image name: https://i.imgur.com/9ZC02Osl.jpg. 
 * Now your image is a large thumbnail! (640×640 pixels)
 * 
 * Here are all the dimensions and letters to choose from:
 *     s = Small Square (90×90)
 *     b = Big Square (160×160)
 *     t = Small Thumbnail (160×160)
 *     m = Medium Thumbnail (320×320)
 *     l = Large Thumbnail (640×640)
 *     h = Huge Thumbnail (1024×1024)
 */
function getThumbnail(url: string, size: MediaSizes): string {
    const urlParts = url.split("/");
    const fileName = urlParts[urlParts.length - 1];
    const extension = fileName.split(".")[fileName.split(".").length - 1];
    return `https://i.imgur.com/${getFilename(url)}${size}.${extension}`;
}

@Component({
    selector: "ui-spotting-image-list",
    templateUrl: "./spotting-image-list.component.html",
    styleUrls: ["./spotting-image-list.component.scss"],
})
export class SpottingImageListComponent implements OnInit, OnDestroy {
    @Input() eventId!: string;

    imageUrls: ImageUrls[] = [];

    subscription: Subscription | undefined = undefined;
    loading: boolean = true;

    constructor(public getMediaService: GetMediasService,
        private nzImageService: NzImageService,
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
                this.imageUrls = data.events[0].medias.map(
                    (media) => {
                        return {
                            fullSize: media.file.url,
                            preview: getThumbnail(media.file.url, "m"),
                        };
                    }
                );

                if(this.imageUrls.length === 0){
                    this.loading = loading;
                }
                
            });
    }

    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
    }

    onViewImage(index: number): void {
        this.nzImageService.preview(
            this.imageUrls.map((val) => {
                return { src: val.fullSize };
            })
        ).switchTo(index);
    }

    markLoaded(): void{
        this.loading = false;
    }
}
