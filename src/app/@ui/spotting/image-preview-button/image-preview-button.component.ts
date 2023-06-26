import { NzDrawerService } from "ng-zorro-antd/drawer";
import {
    SpottingImageListComponent,
} from "src/app/@ui/spotting-image-list/spotting-image-list.component";

import { Component, HostListener, Input } from "@angular/core";

@Component({
    selector: "ui-spotting-image-preview-button",
    templateUrl: "./image-preview-button.component.html",
    styleUrls: ["./image-preview-button.component.scss"]
})
export class ImagePreviewButtonComponent {
  @Input() count!: number;
  @Input() eventId!: string;

  width: string = "700px";

  constructor(
    private drawerService: NzDrawerService
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
      this.drawerService.create<SpottingImageListComponent, { value: string }, string>({
          nzTitle: "Image Preview",
          // nzFooter: 'Footer',
          // nzExtra: 'Extra',
          nzWidth: this.width,
          nzContent: SpottingImageListComponent,
          nzContentParams: {
              eventId: this.eventId,
          }
      });
  }
}
