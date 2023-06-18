import {
    CheckBoxModule,
    DataTableModule,
    LoadingModule,
    PanelModule,
    TagsModule,
    ToggleModule,
    TooltipModule
} from "ng-devui";
import { ButtonModule } from "ng-devui/button";
import { CategorySearchModule } from "ng-devui/category-search";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzSpinModule } from "ng-zorro-antd/spin";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";

import {
    SpottingImageListModule
} from "../@ui/spotting-image-list/spotting-image-list.module";
import {
    SpottingTypeCellDisplayModule
} from "../@ui/spotting-type-cell-display/spotting-type-cell-display.module";
import {
    SpottingTypeTagModule
} from "../@ui/spotting-type-tag/spotting-type-tag.module";
import {
    VehicleStatusTagModule
} from "../@ui/vehicle-status-tag/vehicle-status-tag.module";
import {
    VehicleTableCellDisplayModule
} from "../@ui/vehicle-table-cell-display/vehicle-table-cell-display.module";
import {
    CoordinatesHumanizerModule
} from "../pipes/coordinates-humanizer/coordinates-humanizer.module";
import {
    VehicleStatusPipeModule
} from "../pipes/vehicle-status/vehicle-status.module";
import {
    ConsoleEventsTableComponent
} from "./events-table/events-table.component";
import { ConsoleMainComponent } from "./main/main.component";

@NgModule({
    declarations: [ConsoleMainComponent, ConsoleEventsTableComponent],
    imports: [
        CommonModule,
        FormsModule,
        
        // devui
        ButtonModule,
        CategorySearchModule,
        CheckBoxModule,
        DataTableModule,
        LoadingModule,
        PanelModule,
        TagsModule,
        ToggleModule,
        TooltipModule,
        
        // ng-zorro
        NzIconModule,
        NzSpinModule,
        
        // Own Imports
        CoordinatesHumanizerModule,
        SpottingImageListModule,
        SpottingTypeCellDisplayModule,
        SpottingTypeTagModule,
        VehicleStatusPipeModule,
        VehicleStatusTagModule,
        VehicleTableCellDisplayModule,
    ],
})
export class ConsoleModule {}
