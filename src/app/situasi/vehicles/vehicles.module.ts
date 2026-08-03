import { NzTabsModule } from "ng-zorro-antd/tabs";
import { SpottingLineCalendarHeatmapComponent } from "src/app/@ui/spotting-line-calendar-heatmap/spotting-line-calendar-heatmap.component";
import { VehicleStatusHistoryModule } from "src/app/@ui/vehicle-status-history/vehicle-status-history.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { VehiclesComponent } from "./vehicles.component";

@NgModule({
    declarations: [VehiclesComponent],
    imports: [
        CommonModule,
        NzTabsModule,

        // Internal Imports
        SpottingLineCalendarHeatmapComponent,
        VehicleStatusHistoryModule,
    ],
})
export class VehiclesModule {}
