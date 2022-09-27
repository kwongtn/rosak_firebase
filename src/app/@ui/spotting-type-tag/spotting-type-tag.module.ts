import { TagsModule } from "ng-devui";
import {
    SpottingTypePipeModule,
} from "src/app/pipes/spotting-type/spotting-type.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { SpottingTypeTagComponent } from "./spotting-type-tag.component";

@NgModule({
    declarations: [SpottingTypeTagComponent],
    imports: [CommonModule, TagsModule, SpottingTypePipeModule],
    exports: [SpottingTypeTagComponent],
})
export class SpottingTypeTagModule {}
