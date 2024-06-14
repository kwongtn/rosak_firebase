import { TagsModule } from "ng-devui";
import {
    SpottingTypePipe,
} from "src/app/pipes/spotting-type/spotting-type.pipe";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { SpottingTypeTagComponent } from "./spotting-type-tag.component";

@NgModule({
    declarations: [SpottingTypeTagComponent],
    imports: [CommonModule, TagsModule, SpottingTypePipe],
    exports: [SpottingTypeTagComponent],
})
export class SpottingTypeTagModule {}
