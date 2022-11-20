import {
    CheckBoxModule,
    DataTableModule,
    LoadingModule,
    PanelModule,
    TagsModule,
    ToggleModule,
    TooltipModule,
} from "ng-devui";
import { ButtonModule } from "ng-devui/button";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";

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
    CoordinatesHumanizerModule,
} from "../pipes/coordinates-humanizer/coordinates-humanizer.module";
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
        ToggleModule,
        TooltipModule,
        CheckBoxModule,
        ButtonModule,
        FormsModule,
        CoordinatesHumanizerModule,
    ],
})
export class ConsoleModule {}
