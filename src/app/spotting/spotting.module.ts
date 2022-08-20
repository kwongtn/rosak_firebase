import { CheckBoxModule, DevUIModule, PanelModule } from "ng-devui";
import { AlertModule } from "ng-devui/alert";
import { CascaderModule } from "ng-devui/cascader";
import { DataTableModule } from "ng-devui/data-table";
import { DatepickerModule } from "ng-devui/datepicker";
import { IconModule } from "ng-devui/icon";
import { LoadingModule } from "ng-devui/loading";
import { ModalModule } from "ng-devui/modal";
import { SelectModule } from "ng-devui/select";
import { TabsModule } from "ng-devui/tabs";
import { TagsModule } from "ng-devui/tags";
import { TooltipModule } from "ng-devui/tooltip";

import { CommonModule } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

import { GraphQLModule } from "../graphql.module";
import { SpottingTypePipe } from "../pipes/spotting-type/spotting-type.pipe";
import {
    VehicleStatusPipePipe,
} from "../pipes/vehicle-status/vehicle-status-pipe.pipe";
import { SpottingFormComponent } from "./spotting-form/spotting-form.component";
import { SpottingMainComponent } from "./spotting-main/spotting-main.component";
import {
    InlineHistoryComponent,
} from "./vehicle-type-container/spotting-table/inline-history/inline-history.component";
import {
    SpottingTableComponent,
} from "./vehicle-type-container/spotting-table/spotting-table.component";
import {
    VehicleTypeContainerComponent,
} from "./vehicle-type-container/vehicle-type-container.component";

@NgModule({
    declarations: [
        SpottingFormComponent,
        SpottingMainComponent,
        SpottingTableComponent,
        VehicleStatusPipePipe,
        SpottingTypePipe,
        VehicleTypeContainerComponent,
        InlineHistoryComponent,
    ],
    imports: [
        CommonModule,
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
        AlertModule,
        TagsModule,
        TabsModule,
        TooltipModule,
        PanelModule,
        CheckBoxModule,
    ],
    exports: [SpottingFormComponent, SpottingMainComponent],
    providers: [],
})
export class SpottingModule {}
