import { NzBreadCrumbModule } from "ng-zorro-antd/breadcrumb";
import { NzDropDownModule } from "ng-zorro-antd/dropdown";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzLayoutModule } from "ng-zorro-antd/layout";
import { NzMenuModule } from "ng-zorro-antd/menu";
import { NzPageHeaderModule } from "ng-zorro-antd/page-header";
import { FooterModule } from "src/app/@ui/footer/footer.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    SpottingLineCalendarHeatmapModule,
} from "../@ui/spotting-line-calendar-heatmap/spotting-line-calendar-heatmap.module";
import { SituasiRoutingModule } from "./situasi-routing.module";
import { SituasiComponent } from "./situasi.component";

@NgModule({
    declarations: [SituasiComponent],
    imports: [
        CommonModule,

        // ng-zorro-antd
        NzBreadCrumbModule,
        NzDropDownModule,
        NzIconModule,
        NzLayoutModule,
        NzMenuModule,
        NzPageHeaderModule,

        // Self imports
        FooterModule,
        SituasiRoutingModule,
        SpottingLineCalendarHeatmapModule,
    ],
})
export class SituasiModule {}
