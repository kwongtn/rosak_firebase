import { NzCardModule } from "ng-zorro-antd/card";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzSegmentedModule } from "ng-zorro-antd/segmented";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzStatisticModule } from "ng-zorro-antd/statistic";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    VehicleStatusHistoryComponent,
} from "./vehicle-status-history.component";

@NgModule({
    declarations: [VehicleStatusHistoryComponent],
    imports: [
        CommonModule,

        // ng-zorro
        NzCardModule,
        NzGridModule,
        NzIconModule,
        NzSegmentedModule,
        NzSpinModule,
        NzStatisticModule,
    ],
    exports: [VehicleStatusHistoryComponent],
})
export class VehicleStatusHistoryModule {}
