import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    SpottingTypeCellDisplayComponent,
} from "./spotting-type-cell-display.component";

@NgModule({
    declarations: [SpottingTypeCellDisplayComponent],
    imports: [CommonModule],
    exports: [SpottingTypeCellDisplayComponent],
})
export class SpottingTypeCellDisplayModule {}
