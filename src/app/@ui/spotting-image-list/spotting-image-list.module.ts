import { NzGridModule } from "ng-zorro-antd/grid";
import { NzImageModule } from "ng-zorro-antd/image";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { SpottingImageListComponent } from "./spotting-image-list.component";

@NgModule({
    declarations: [SpottingImageListComponent],
    imports: [CommonModule, NzImageModule, NzGridModule],
    exports: [SpottingImageListComponent],
})
export class SpottingImageListModule {}
