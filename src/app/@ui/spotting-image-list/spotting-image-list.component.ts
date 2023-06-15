import { Subscription } from "rxjs";

import { Component, Input, OnDestroy, OnInit } from "@angular/core";

import { GetMediasService } from "./services/get-medias.service";

@Component({
    selector: "ui-spotting-image-list",
    templateUrl: "./spotting-image-list.component.html",
    styleUrls: ["./spotting-image-list.component.scss"],
})
export class SpottingImageListComponent implements OnInit, OnDestroy {
    @Input() eventId!: string;

    imageUrls: string[] = [];

    subscription: Subscription | undefined = undefined;

    constructor(public getMediaService: GetMediasService) {
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
                    (media) => media.file.url
                );
            });
    }

    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
    }
}
