import { DataTableModule, LoadingModule } from "ng-devui";
import { AvatarModule } from "ng-devui/avatar";
import { CardModule } from "ng-devui/card";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    SpottingTypeCellDisplayModule,
} from "../@ui/spotting-type-cell-display/spotting-type-cell-display.module";
import {
    VehicleStatusTagModule,
} from "../@ui/vehicle-status-tag/vehicle-status-tag.module";
import {
    VehicleTableCellDisplayModule,
} from "../@ui/vehicle-table-cell-display/vehicle-table-cell-display.module";
import {
    CoordinatesHumanizerModule,
} from "../pipes/coordinates-humanizer/coordinates-humanizer.module";
import { ProfileMainComponent } from "./main/main.component";
import {
    SpottingTrendsComponent,
} from "./spotting-trends/spotting-trends.component";
import { ProfileSpottingsComponent } from "./spottings/spottings.component";
import { ProfileUserComponent } from "./user/user.component";

@NgModule({
    declarations: [
        ProfileMainComponent,
        ProfileUserComponent,
        ProfileSpottingsComponent,
        SpottingTrendsComponent,
    ],
    imports: [
        CommonModule,
        DataTableModule,
        LoadingModule,
        CardModule,
        CoordinatesHumanizerModule,
        SpottingTypeCellDisplayModule,
        VehicleStatusTagModule,
        VehicleTableCellDisplayModule,
        AvatarModule,
    ],
})
export class ProfileModule {}
