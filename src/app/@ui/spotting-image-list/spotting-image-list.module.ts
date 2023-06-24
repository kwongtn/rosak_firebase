import { NzGridModule } from "ng-zorro-antd/grid";
import { NzImageModule } from "ng-zorro-antd/image";
import { NzSpinModule } from "ng-zorro-antd/spin";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { SpottingImageListComponent } from "./spotting-image-list.component";

@NgModule({
    declarations: [SpottingImageListComponent],
    imports: [CommonModule, NzImageModule, NzGridModule, NzSpinModule],
    exports: [SpottingImageListComponent],
})
export class SpottingImageListModule { }
