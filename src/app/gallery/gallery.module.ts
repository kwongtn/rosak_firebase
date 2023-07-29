import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { ImageGridModule } from "../@ui/image-grid/image-grid.module";
import { GalleryComponent } from "./gallery.component";

@NgModule({
    declarations: [GalleryComponent],
    imports: [CommonModule, ImageGridModule],
})
export class GalleryModule {}
