import {
    SpottingTypePipe,
} from "src/app/pipes/spotting-type/spotting-type.pipe";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { NzTagModule } from "ng-zorro-antd/tag";

import { SpottingTypeTagComponent } from "./spotting-type-tag.component";

@NgModule({
    declarations: [SpottingTypeTagComponent],
    imports: [CommonModule, NzTagModule, SpottingTypePipe],
    exports: [SpottingTypeTagComponent],
})
export class SpottingTypeTagModule {}
