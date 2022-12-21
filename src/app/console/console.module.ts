import {
    CheckBoxModule,
    LoadingModule,
    PanelModule,
    ToggleModule,
    TooltipModule,
} from "ng-devui";
import { ButtonModule } from "ng-devui/button";

import { FormsModule } from "@angular/forms";

import {
    SpottingTypeCellDisplayModule,
} from "../@ui/spotting-type-cell-display/spotting-type-cell-display.module";
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
        SpottingTypeCellDisplayModule,

        NzButtonModule,
        NzSpinModule,
        NzSwitchModule,
        NzToolTipModule,
    ],
})
export class ConsoleModule {}
