import { DataTableModule, LoadingModule } from "ng-devui";
import { AvatarModule } from "ng-devui/avatar";
import { CardModule } from "ng-devui/card";
import { NzButtonModule } from "ng-zorro-antd/button";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzInputModule } from "ng-zorro-antd/input";
import { NzPopconfirmModule } from "ng-zorro-antd/popconfirm";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzStatisticModule } from "ng-zorro-antd/statistic";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import {
    SpottingImageListModule,
} from "src/app/@ui/spotting-image-list/spotting-image-list.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";

import {
    SpottingTypeCellDisplayModule,
} from "../@ui/spotting-type-cell-display/spotting-type-cell-display.module";
import {
    ImagePreviewButtonModule,
} from "../@ui/spotting/image-preview-button/image-preview-button.module";
import {
    VehicleStatusTagModule,
} from "../@ui/vehicle-status-tag/vehicle-status-tag.module";
import {
    VehicleTableCellDisplayModule,
} from "../@ui/vehicle-table-cell-display/vehicle-table-cell-display.module";
import {
    CoordinatesHumanizerModule,
} from "../pipes/coordinates-humanizer/coordinates-humanizer.module";
import { ProfileMainComponent } from "./profile.component";
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
        FormsModule,

        // devui
        AvatarModule,
        CardModule,
        DataTableModule,
        LoadingModule,

        // ng-zorro
        NzButtonModule,
        NzCardModule,
        NzGridModule,
        NzIconModule,
        NzInputModule,
        NzPopconfirmModule,
        NzSpinModule,
        NzStatisticModule,
        NzToolTipModule,

        // Internal imports
        CoordinatesHumanizerModule,
        ImagePreviewButtonModule,
        SpottingImageListModule,
        SpottingTypeCellDisplayModule,
        VehicleStatusTagModule,
        VehicleTableCellDisplayModule,
    ],
})
export class ProfileModule {}
