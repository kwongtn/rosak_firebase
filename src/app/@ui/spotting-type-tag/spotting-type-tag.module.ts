import { NzTagModule } from "ng-zorro-antd/tag";
import {
    SpottingTypePipeModule,
} from "src/app/pipes/spotting-type/spotting-type.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { SpottingTypeTagComponent } from "./spotting-type-tag.component";

@NgModule({
    declarations: [SpottingTypeTagComponent],
    imports: [
        CommonModule,

        // ng-zorro-antd
        NzTagModule,

        // Internal modules
        SpottingTypePipeModule,
    ],
    exports: [SpottingTypeTagComponent],
})
export class SpottingTypeTagModule {}
