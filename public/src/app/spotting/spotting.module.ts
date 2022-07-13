import { DevUIModule } from "ng-devui";
import { CascaderModule } from "ng-devui/cascader";
import { DatepickerModule } from "ng-devui/datepicker";
import { IconModule } from "ng-devui/icon";
import { SelectModule } from "ng-devui/select";

import { CommonModule } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";

import { GraphQLModule } from "../graphql.module";
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
        ReactiveFormsModule,
        DatepickerModule,
        CascaderModule,
        IconModule,
        GraphQLModule,
        HttpClientModule,
    ],
    exports: [SpottingFormComponent],
    providers: [],
})
export class SpottingModule {}
