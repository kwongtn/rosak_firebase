import { InViewportModule } from "ng-in-viewport";
import { NzImageModule } from "ng-zorro-antd/image";
import { NzSpinModule } from "ng-zorro-antd/spin";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { ImageGridComponent } from "./image-grid.component";

@NgModule({
    declarations: [ImageGridComponent],
    imports: [
        CommonModule,
        InViewportModule,

        // ng-zorro
        NzImageModule,
        NzSpinModule,
    ],
    exports: [ImageGridComponent],
})
export class ImageGridModule {}
