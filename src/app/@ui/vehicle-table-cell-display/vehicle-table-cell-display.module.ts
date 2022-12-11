import { NzTagModule } from "ng-zorro-antd/tag";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";

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

        // ng-zorro-antd
        NzTagModule,
        NzToolTipModule,

        // Internal modules
        VehicleStatusTagModule,
    ],
    exports: [VehicleTableCellDisplayComponent],
})
export class VehicleTableCellDisplayModule {}
