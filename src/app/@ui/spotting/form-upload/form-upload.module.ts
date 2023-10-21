import { UploadModule } from "ng-devui/upload";
import { NzPopconfirmModule } from "ng-zorro-antd/popconfirm";
import { NzSpinModule } from "ng-zorro-antd/spin";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { FormUploadComponent } from "./form-upload.component";

@NgModule({
    declarations: [
        FormUploadComponent,
    ],
    imports: [
        CommonModule,
        NzPopconfirmModule,
        NzSpinModule,
        UploadModule,
    ],
    exports: [
        FormUploadComponent
    ]
})
export class FormUploadModule { }
