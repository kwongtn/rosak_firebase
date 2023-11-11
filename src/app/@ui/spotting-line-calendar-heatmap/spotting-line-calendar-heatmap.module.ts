import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    SpottingLineCalendarHeatmapComponent,
} from "./spotting-line-calendar-heatmap.component";

@NgModule({
    declarations: [SpottingLineCalendarHeatmapComponent],
    imports: [CommonModule],
    exports: [SpottingLineCalendarHeatmapComponent],
})
export class SpottingLineCalendarHeatmapModule {}
