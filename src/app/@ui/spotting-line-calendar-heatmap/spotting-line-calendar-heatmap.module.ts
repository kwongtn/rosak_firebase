import { NzSpinModule } from "ng-zorro-antd/spin";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    SpottingLineCalendarHeatmapComponent,
} from "./spotting-line-calendar-heatmap.component";

@NgModule({
    declarations: [SpottingLineCalendarHeatmapComponent],
    imports: [CommonModule, NzSpinModule],
    exports: [SpottingLineCalendarHeatmapComponent],
})
export class SpottingLineCalendarHeatmapModule {}
