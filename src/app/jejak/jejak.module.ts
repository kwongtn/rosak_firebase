import { NzButtonModule } from "ng-zorro-antd/button";
import { NzDatePickerModule } from "ng-zorro-antd/date-picker";
import { NzFormModule } from "ng-zorro-antd/form";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzSelectModule } from "ng-zorro-antd/select";
import { NzSliderModule } from "ng-zorro-antd/slider";
import { NzSpinModule } from "ng-zorro-antd/spin";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

import { JejakMainComponent } from "./main/main.component";

@NgModule({
    declarations: [JejakMainComponent],
    imports: [
        CommonModule,
        NzSliderModule,
        NzSpinModule,
        NzFormModule,
        FormsModule,
        ReactiveFormsModule,
        NzSelectModule,
        NzGridModule,
        NzButtonModule,
        NzDatePickerModule,
    ],
})
export class JejakModule {}
