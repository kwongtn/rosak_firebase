import { NzIconModule } from "ng-zorro-antd/icon";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import {
    BeautifulDecimalModule,
} from "src/app/pipes/beautiful-decimal/beautiful-decimal.module";
import {
    CoordinatesHumanizerModule,
} from "src/app/pipes/coordinates-humanizer/coordinates-humanizer.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    SpottingTypeTagModule,
} from "../spotting-type-tag/spotting-type-tag.module";
import {
    SpottingTypeCellDisplayComponent,
} from "./spotting-type-cell-display.component";

@NgModule({
    declarations: [SpottingTypeCellDisplayComponent],
    imports: [
        CommonModule,

        // ng-zorro-antd
        NzIconModule,
        NzToolTipModule,

        // Internal modules
        BeautifulDecimalModule,
        CoordinatesHumanizerModule,
        SpottingTypeTagModule,
    ],
    exports: [SpottingTypeCellDisplayComponent],
})
export class SpottingTypeCellDisplayModule {}
