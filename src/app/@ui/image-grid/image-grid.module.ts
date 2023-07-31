import { InViewportModule } from "ng-in-viewport";
import { NzImageModule } from "ng-zorro-antd/image";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { ImageGridComponent } from "./image-grid.component";

@NgModule({
    declarations: [ImageGridComponent],
    imports: [CommonModule, NzImageModule, InViewportModule],
    exports: [ImageGridComponent],
})
export class ImageGridModule {}
