import { QueryRef } from "apollo-angular";
import { InViewportModule } from "ng-in-viewport";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { Subscription } from "rxjs";
import { InputImage } from "src/app/@ui/image-grid/image-grid.component";
import { ImageGridModule } from "src/app/@ui/image-grid/image-grid.module";
import { getThumbnail } from "src/app/@util/imgur";

import { CommonModule, KeyValue } from "@angular/common";
import { Component, OnDestroy, OnInit } from "@angular/core";

import {
    GetMediasService,
    MediaRelayResponse,
} from "./services/get-medias.service";

@Component({
    selector: "app-gallery",
    templateUrl: "./gallery.component.html",
    styleUrls: ["./gallery.component.scss"],
    standalone: true,
    imports: [CommonModule, ImageGridModule, InViewportModule, NzSpinModule],
})
export class GalleryComponent implements OnInit, OnDestroy {
    imageDateMaps: {
        [created: string]: {
            images: InputImage[];
            displayImages: boolean;
            height?: string;
        };
    } = {};

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
                        if (!this.imageDateMaps[elem.dateKey]) {
                            this.imageDateMaps[elem.dateKey] = {
                                images: [],
                                displayImages: false,
                            };
                        }

                        this.imageDateMaps[elem.dateKey].images =
                            elem.medias.map((media) => {
                                const returnObj = {
                                    height: media.height,
                                    width: media.width,
                                    url: "./assets/image-not-found.png",
                                    thumbnailUrl:
                                        "./assets/image-not-found.png",
                                    display: false,
                                };
                                if (media.file) {
                                    returnObj.url = media.file.url;
                                    returnObj.thumbnailUrl = getThumbnail(
                                        media.file.url,
                                        "m"
                                    );
                                }

                                return returnObj;
                            });
                    });

                    this.loading = loading;
                }
            );
    }

    onIntersection({
        target,
        visible,
    }: {
        target: Element;
        visible: boolean;
    }): void {
        // this.renderer.addClass(target, visible ? 'active' : 'inactive');
        // this.renderer.removeClass(target, visible ? 'inactive' : 'active');
        if (visible) {
            console.log(target.id, "✅");
        } else {
            console.log(target.id, "❌");
        }
        this.imageDateMaps[target.id].displayImages = visible;
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
