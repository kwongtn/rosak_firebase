import { PopoverModule } from "ng-devui/popover";
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
        SpottingTypeTagModule,
        PopoverModule,
        CoordinatesHumanizerModule,
    ],
    exports: [SpottingTypeCellDisplayComponent],
})
export class SpottingTypeCellDisplayModule {}
