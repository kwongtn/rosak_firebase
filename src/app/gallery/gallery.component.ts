import { QueryRef } from "apollo-angular";
import { Subscription } from "rxjs";
import { InputImage } from "src/app/@ui/image-grid/image-grid.component";
import { getThumbnail } from "src/app/@util/imgur";

import { KeyValue } from "@angular/common";
import { Component, OnDestroy, OnInit } from "@angular/core";

import {
    GetMediasService,
    MediaRelayResponse,
} from "./services/get-medias.service";

@Component({
    selector: "app-gallery",
    templateUrl: "./gallery.component.html",
    styleUrls: ["./gallery.component.scss"],
})
export class GalleryComponent implements OnInit, OnDestroy {
    imageDateMaps: { [created: string]: InputImage[] } = {};

    watchQueryOption!: QueryRef<any>;
    mainQuerySubscription!: Subscription;

    firstCursor: string | null = null;
    lastCursor: string | null = null;

    loading: boolean = true;

    constructor(private gqlService: GetMediasService) {}

    async ngOnInit() {
        this.watchQueryOption = this.gqlService.watch(
            {
                type: "DAY",
            },
            {
                fetchPolicy: "network-only",
            }
        );

        this.mainQuerySubscription =
            this.watchQueryOption.valueChanges.subscribe(
                ({
                    data,
                    loading,
                }: {
                    data: MediaRelayResponse;
                    loading: boolean;
                }) => {
                    data.mediasGroupByPeriod.forEach((elem) => {
                        this.imageDateMaps[elem.dateKey] = elem.medias.map(
                            (media) => {
                                return {
                                    height: media.height,
                                    width: media.width,
                                    url: media.file.url,
                                    thumbnailUrl: getThumbnail(
                                        media.file.url,
                                        "l"
                                    ),
                                };
                            }
                        );
                    });

                    this.loading = loading;
                }
            );
    }

    compareFn<K, V>(a: KeyValue<K, V>, b: KeyValue<K, V>) {
        if (a.key < b.key) {
            return 1;
        } else {
            return -1;
        }
    }

    ngOnDestroy(): void {
        this.mainQuerySubscription?.unsubscribe();
    }
}
