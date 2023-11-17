import { TagsModule } from "ng-devui";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { WheelStatusTagComponent } from "./wheel-status-tag.component";

@NgModule({
    declarations: [WheelStatusTagComponent],
    imports: [CommonModule, TagsModule],
    exports: [WheelStatusTagComponent],
})
export class WheelStatusTagModule {}
