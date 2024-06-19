import { NzButtonModule } from "ng-zorro-antd/button";
import { NzDrawerRef, NzDrawerService } from "ng-zorro-antd/drawer";
import { NzIconModule } from "ng-zorro-antd/icon";
import {
    SpottingImageListComponent,
} from "src/app/@ui/spotting-image-list/spotting-image-list.component";
import {
    ImageUploadService,
} from "src/app/services/spotting/image-upload.service";
import { ToastService } from "src/app/services/toast.service";

import {
    Component,
    HostListener,
    Input,
    TemplateRef,
    ViewChild,
} from "@angular/core";

import { ImageFile } from "../form-upload/form-upload.component";

@Component({
    selector: "ui-spotting-image-preview-button",
    templateUrl: "./image-preview-button.component.html",
    styleUrls: ["./image-preview-button.component.scss"],
    standalone: true,
    imports: [
        NzButtonModule,
        NzIconModule,
    ],
})
export class ImagePreviewButtonComponent {
    @Input() count!: number;
    @Input() eventId!: string;
    @Input() isMine: boolean = false;

    @ViewChild("drawerFooter") drawerFooter!: TemplateRef<any>;

    /**
     * 280px - 1 img
     * 480px - 2 imgs
     * 700px - 3 imgs
     * 905px - 4 imgs
     */
    width: string = "700px";
    drawerRef!: NzDrawerRef<SpottingImageListComponent, string>;

    constructor(
        private drawerService: NzDrawerService,
        private imageUploadService: ImageUploadService,
        private toastService: ToastService
    ) {
        this.resize();
    }

    @HostListener("window:resize")
    resize(): void {
        const clientWidth = document.body.clientWidth;
        this.width =
            clientWidth < 500
                ? "280px"
                : clientWidth < 1024
                    ? "480px"
                    : clientWidth < 1300
                        ? "700px"
                        : "905px";
    }

    onPictureIconClick() {
        this.drawerRef = this.drawerService.create<
            SpottingImageListComponent,
            { eventId: string; isMine: boolean },
            string
        >({
            nzTitle: "Image Preview",
            nzFooter: this.isMine ? this.drawerFooter : undefined,
            // nzExtra: 'Extra',
            nzWidth: this.width,
            nzContent: SpottingImageListComponent,
            nzContentParams: {
                eventId: this.eventId,
                isMine: this.isMine,
            },
        });
    }

    close() {
        this.drawerRef?.close();
    }

    submit() {
        const pendingUploads: ImageFile[] =
            this.drawerRef?.getContentComponent()?.pendingUploads ?? [];

        if (pendingUploads.length > 0) {
            pendingUploads.forEach((file: ImageFile) => {
                this.imageUploadService.addToQueue(
                    this.eventId,
                    file,
                    "SPOTTING_EVENT"
                );
            });
            this.toastService.addMessage(
                "Image upload queued. Please wait for uploads to complete before closing this tab.",
                "info"
            );
        }
        this.drawerRef?.close();
    }
}
