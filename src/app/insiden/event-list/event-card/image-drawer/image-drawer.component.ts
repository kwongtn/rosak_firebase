import { NzImageService } from "ng-zorro-antd/image";
import { Subscription } from "rxjs";
import { InputImage } from "src/app/@ui/image-grid/image-grid.component";
import {
    ImageFile,
} from "src/app/@ui/spotting/form-upload/form-upload.component";
import {
    GetCalIncidentMediasService,
} from "src/app/insiden/services/get-cal-incident-medias.service";

import { Component, Input } from "@angular/core";

@Component({
    selector: "insiden-event-image-drawer",
    templateUrl: "./image-drawer.component.html",
    styleUrls: ["./image-drawer.component.scss"],
})
export class ImageDrawerComponent {
    @Input() incidentId!: string;

    imageUrls: InputImage[] = [];

    subscription: Subscription | undefined = undefined;
    loading: boolean = true;

    pendingUploads: ImageFile[] = [];

    constructor(
        public getMediaService: GetCalIncidentMediasService,
        private nzImageService: NzImageService
    ) {
        return;
    }

    ngOnInit(): void {
        this.subscription = this.getMediaService
            .fetch({
                filters: {
                    id: this.incidentId,
                },
            })
            .subscribe(({ data, loading }) => {
                console.log("Received data");
                console.log(data);
                this.imageUrls = data.calendarIncidents[0].medias.map(
                    (media) => {
                        return {
                            src: media.discordSuffix,
                            width: media.width,
                            height: media.height,
                            display: true,
                        };
                    }
                );

                this.loading = loading;
            });
    }

    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
    }

    onViewImage(index: number): void {
        this.nzImageService
            .preview(
                this.imageUrls.map((val) => {
                    return { src: `https://cdn.discordapp.com/attachments/${val.src}` };
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
