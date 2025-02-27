import { NzSpinModule } from "ng-zorro-antd/spin";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { NzAlertModule } from "ng-zorro-antd/alert";
import { NzButtonModule } from "ng-zorro-antd/button";
import { SpottingLineCalendarHeatmapComponent } from "./spotting-line-calendar-heatmap.component";

@NgModule({
    declarations: [SpottingLineCalendarHeatmapComponent],
    imports: [CommonModule, NzSpinModule, NzButtonModule, NzAlertModule],
    exports: [SpottingLineCalendarHeatmapComponent],
})
export class SpottingLineCalendarHeatmapModule {}
