import { NzBreadCrumbModule } from "ng-zorro-antd/breadcrumb";
import { NzDropDownModule } from "ng-zorro-antd/dropdown";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzLayoutModule } from "ng-zorro-antd/layout";
import { NzMenuModule } from "ng-zorro-antd/menu";
import { NzPageHeaderModule } from "ng-zorro-antd/page-header";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { FooterComponent } from "../@ui/footer/footer.component";
import { SpottingLineCalendarHeatmapComponent } from "../@ui/spotting-line-calendar-heatmap/spotting-line-calendar-heatmap.component";
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
        FooterComponent,
        SituasiRoutingModule,
        SpottingLineCalendarHeatmapComponent,
    ],
})
export class SituasiModule {}
