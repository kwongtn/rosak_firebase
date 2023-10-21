import { NzButtonModule } from "ng-zorro-antd/button";
import { NzIconModule } from "ng-zorro-antd/icon";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { ImagePreviewButtonComponent } from "./image-preview-button.component";

@NgModule({
    declarations: [
        ImagePreviewButtonComponent
    ],
    imports: [
        CommonModule,
        NzButtonModule,
        NzIconModule,
    ],
    exports:[
        ImagePreviewButtonComponent
    ]
})
export class ImagePreviewButtonModule { }
