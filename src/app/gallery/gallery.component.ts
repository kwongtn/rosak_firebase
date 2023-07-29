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
                order: {
                    created: "DESC",
                },
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
                    data.medias.edges.forEach((media) => {
                        const key = media.node.created.split("T")[0];
                        const data = {
                            height: media.node.height,
                            width: media.node.width,
                            url: media.node.file.url,
                            thumbnailUrl: getThumbnail(
                                media.node.file.url,
                                "l"
                            ),
                        };

                        if (!this.imageDateMaps[key]) {
                            this.imageDateMaps[key] = [data];
                        } else {
                            this.imageDateMaps[key].push(data);
                        }
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
