import { NzImageModule } from "ng-zorro-antd/image";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { SpottingImageListComponent } from "./spotting-image-list.component";

@NgModule({
    declarations: [SpottingImageListComponent],
    imports: [CommonModule, NzImageModule],
    exports: [SpottingImageListComponent],
})
export class SpottingImageListModule {}
