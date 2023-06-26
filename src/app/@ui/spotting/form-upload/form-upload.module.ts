import { UploadModule } from "ng-devui/upload";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { FormUploadComponent } from "./form-upload.component";

@NgModule({
    declarations: [
        FormUploadComponent,
    ],
    imports: [
        CommonModule,
        
        UploadModule,
    ],
    exports: [
        FormUploadComponent
    ]
})
export class FormUploadModule { }
