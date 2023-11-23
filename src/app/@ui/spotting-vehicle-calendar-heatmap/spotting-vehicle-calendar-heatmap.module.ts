import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    SpottingVehicleCalendarHeatmapComponent,
} from "./spotting-vehicle-calendar-heatmap.component";

@NgModule({
    declarations: [SpottingVehicleCalendarHeatmapComponent],
    imports: [CommonModule],
    exports: [SpottingVehicleCalendarHeatmapComponent],
})
export class SpottingVehicleCalendarHeatmapModule {}
