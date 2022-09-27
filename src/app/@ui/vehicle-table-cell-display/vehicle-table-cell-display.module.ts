import { TooltipModule } from "ng-devui";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    VehicleTableCellDisplayComponent,
} from "./vehicle-table-cell-display.component";

@NgModule({
    declarations: [VehicleTableCellDisplayComponent],
    imports: [CommonModule, TooltipModule],
})
export class VehicleTableCellDisplayModule {}
