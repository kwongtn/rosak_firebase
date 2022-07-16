import { DevUIModule } from "ng-devui";
import { CascaderModule } from "ng-devui/cascader";
import { DataTableModule } from "ng-devui/data-table";
import { DatepickerModule } from "ng-devui/datepicker";
import { IconModule } from "ng-devui/icon";
import { LoadingModule } from "ng-devui/loading";
import { ModalModule } from "ng-devui/modal";
import { SelectModule } from "ng-devui/select";

import { CommonModule } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";

import { GraphQLModule } from "../graphql.module";
import { VehicleStatusPipePipe } from "../pipes/vehicle-status/vehicle-status-pipe.pipe";
import { SpottingFormComponent } from "./spotting-form/spotting-form.component";
import { SpottingMainComponent } from "./spotting-main/spotting-main.component";
import { SpottingTableComponent } from "./spotting-table/spotting-table.component";

@NgModule({
    declarations: [
        SpottingFormComponent,
        SpottingMainComponent,
        SpottingTableComponent,
        VehicleStatusPipePipe,
    ],
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
        ModalModule,
        LoadingModule,
        DataTableModule,
    ],
    exports: [SpottingFormComponent, SpottingMainComponent],
    providers: [],
})
export class SpottingModule {}
