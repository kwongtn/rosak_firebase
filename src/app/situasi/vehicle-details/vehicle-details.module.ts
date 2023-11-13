import {
    SpottingVehicleCalendarHeatmapModule,
} from "src/app/@ui/spotting-vehicle-calendar-heatmap/spotting-vehicle-calendar-heatmap.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { VehicleDetailsComponent } from "./vehicle-details.component";

@NgModule({
    declarations: [VehicleDetailsComponent],
    imports: [CommonModule, SpottingVehicleCalendarHeatmapModule],
})
export class VehicleDetailsModule {
}
