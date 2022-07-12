import { DevUIModule } from "ng-devui";
import { CascaderModule } from "ng-devui/cascader";
import { DatepickerModule } from "ng-devui/datepicker";
import { SelectModule } from "ng-devui/select";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";

import { SpottingFormComponent } from "./spotting-form/spotting-form.component";

@NgModule({
    declarations: [SpottingFormComponent],
    imports: [
        CommonModule,
        BrowserModule,
        BrowserAnimationsModule,
        DevUIModule,
        SelectModule,
        FormsModule,
        DatepickerModule,
        CascaderModule,
    ],
    exports: [SpottingFormComponent],
})
export class SpottingModule {}
