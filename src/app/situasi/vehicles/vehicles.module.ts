import {
    SpottingLineCalendarHeatmapModule,
} from "src/app/@ui/spotting-line-calendar-heatmap/spotting-line-calendar-heatmap.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { VehiclesComponent } from "./vehicles.component";

@NgModule({
    declarations: [VehiclesComponent],
    imports: [
        CommonModule,

        // Internal Imports
        SpottingLineCalendarHeatmapModule,
    ],
})
export class VehiclesModule {}
