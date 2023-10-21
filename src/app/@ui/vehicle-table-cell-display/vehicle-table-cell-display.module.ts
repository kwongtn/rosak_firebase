import { TooltipModule } from "ng-devui";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    VehicleStatusTagModule,
} from "../vehicle-status-tag/vehicle-status-tag.module";
import {
    VehicleTableCellDisplayComponent,
} from "./vehicle-table-cell-display.component";

@NgModule({
    declarations: [VehicleTableCellDisplayComponent],
    imports: [
        CommonModule,

        // DevUI
        TooltipModule,

        // Internal imports
        VehicleStatusTagModule,
    ],
    exports: [VehicleTableCellDisplayComponent],
})
export class VehicleTableCellDisplayModule {}
