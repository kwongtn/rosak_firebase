import { NzSpinModule } from "ng-zorro-antd/spin";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    SpottingVehicleCalendarHeatmapComponent,
} from "./spotting-vehicle-calendar-heatmap.component";

@NgModule({
    declarations: [SpottingVehicleCalendarHeatmapComponent],
    imports: [CommonModule, NzSpinModule],
    exports: [SpottingVehicleCalendarHeatmapComponent],
})
export class SpottingVehicleCalendarHeatmapModule {}
