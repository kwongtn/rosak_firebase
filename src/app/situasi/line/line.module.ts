import {
    SpottingVehicleCalendarHeatmapModule,
} from "src/app/@ui/spotting-vehicle-calendar-heatmap/spotting-vehicle-calendar-heatmap.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { LineComponent } from "./line.component";

@NgModule({
    declarations: [LineComponent],
    imports: [CommonModule, SpottingVehicleCalendarHeatmapModule],
})
export class LineModule {}
