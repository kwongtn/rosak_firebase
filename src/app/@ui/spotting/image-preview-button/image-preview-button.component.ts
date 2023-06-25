import { NzDrawerService } from "ng-zorro-antd/drawer";
import {
    SpottingImageListComponent,
} from "src/app/@ui/spotting-image-list/spotting-image-list.component";

import { Component, Input } from "@angular/core";

@Component({
    selector: "ui-spotting-image-preview-button",
    templateUrl: "./image-preview-button.component.html",
    styleUrls: ["./image-preview-button.component.scss"]
})
export class ImagePreviewButtonComponent {
  @Input() count!: number;
  @Input() eventId!: string;
  

  constructor(
    private drawerService: NzDrawerService
  ) {
      return;
  }

  onPictureIconClick() {
      this.drawerService.create<SpottingImageListComponent, { value: string }, string>({
          nzTitle: "Image Preview",
          // nzFooter: 'Footer',
          // nzExtra: 'Extra',
          nzWidth: "680px",
          nzContent: SpottingImageListComponent,
          nzContentParams: {
              eventId: this.eventId,
          }
      });
  }
}
