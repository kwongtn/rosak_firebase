import { NzCardModule } from "ng-zorro-antd/card";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzSegmentedModule } from "ng-zorro-antd/segmented";
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
        NzStatisticModule,
        NzGridModule,
        NzCardModule,
        NzSegmentedModule,
    ],
    exports: [VehicleStatusHistoryComponent],
})
export class VehicleStatusHistoryModule {}
