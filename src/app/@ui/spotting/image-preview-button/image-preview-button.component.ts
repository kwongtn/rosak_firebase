import { NzDrawerRef, NzDrawerService } from "ng-zorro-antd/drawer";
import {
    SpottingImageListComponent,
} from "src/app/@ui/spotting-image-list/spotting-image-list.component";
import {
    ImageUploadService,
} from "src/app/services/spotting/image-upload.service";
import { ToastService } from "src/app/services/toast/toast.service";

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
    styleUrls: ["./image-preview-button.component.scss"]
})
export class ImagePreviewButtonComponent {
  @Input() count!: number;
  @Input() eventId!: string;
  @Input() isMine: boolean = false;

  @ViewChild("drawerFooter") drawerFooter!: TemplateRef<any>;
  width: string = "700px";
  drawerRef!: NzDrawerRef;

  constructor(
    private drawerService: NzDrawerService,
    private imageUploadService: ImageUploadService, 
    private toastService: ToastService,
  ) {
      this.resize();
  }

  
  @HostListener("window:resize")
  resize(): void {
      const width = document.body.clientWidth;
      this.width = width < 1024 ? "480px" : 
          width < 1280 ? "700px" : "905px" ;
  }

  onPictureIconClick() {
      this.drawerRef= this.drawerService.create<SpottingImageListComponent, { value: string }, string>({
          nzTitle: "Image Preview",
          nzFooter: this.drawerFooter,
          // nzExtra: 'Extra',
          nzWidth: this.width,
          nzContent: SpottingImageListComponent,
          nzContentParams: {
              eventId: this.eventId,
          }
      });
  }

  close(){
      this.drawerRef?.close();
  }

  submit(){
      this.drawerRef?.getContentComponent().pendingUploads.forEach((file: ImageFile) => {
          this.imageUploadService.addToQueue(
              this.eventId,
              file
          );
      });
      this.toastService.addMessage(
          "Image upload queued. Please wait for uploads to complete before closing this tab.", 
          "info"
      );
      this.drawerRef?.close();
  }
}
