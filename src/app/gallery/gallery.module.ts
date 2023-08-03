import { InViewportModule } from "ng-in-viewport";
import { NzSpinModule } from "ng-zorro-antd/spin";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { ImageGridModule } from "../@ui/image-grid/image-grid.module";
import { GalleryComponent } from "./gallery.component";

@NgModule({
    declarations: [GalleryComponent],
    imports: [CommonModule, ImageGridModule, InViewportModule, NzSpinModule],
})
export class GalleryModule {}
