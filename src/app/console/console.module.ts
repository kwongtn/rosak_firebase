import {
    DataTableModule,
    LoadingModule,
    PanelModule,
    TagsModule,
} from "ng-devui";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    SpottingTypeTagModule,
} from "../@ui/spotting-type-tag/spotting-type-tag.module";
import {
    VehicleStatusTagModule,
} from "../@ui/vehicle-status-tag/vehicle-status-tag.module";
import {
    VehicleTableCellDisplayModule,
} from "../@ui/vehicle-table-cell-display/vehicle-table-cell-display.module";
import {
    VehicleStatusPipeModule,
} from "../pipes/vehicle-status/vehicle-status.module";
import {
    ConsoleEventsTableComponent,
} from "./events-table/events-table.component";
import { ConsoleMainComponent } from "./main/main.component";

@NgModule({
    declarations: [ConsoleMainComponent, ConsoleEventsTableComponent],
    imports: [
        CommonModule,
        DataTableModule,
        TagsModule,
        VehicleStatusPipeModule,
        VehicleTableCellDisplayModule,
        VehicleStatusTagModule,
        SpottingTypeTagModule,
        LoadingModule,
        PanelModule,
    ],
})
export class ConsoleModule {}
