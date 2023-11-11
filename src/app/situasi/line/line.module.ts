import {
    SpottingLineCalendarHeatmapModule,
} from "src/app/@ui/spotting-line-calendar-heatmap/spotting-line-calendar-heatmap.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { LineComponent } from "./line.component";

@NgModule({
    declarations: [LineComponent],
    imports: [CommonModule, SpottingLineCalendarHeatmapModule],
})
export class LineModule {}
