import { TagsModule } from "ng-devui/tags";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { LineStatusTagComponent } from "./line-status-tag.component";

@NgModule({
    declarations: [LineStatusTagComponent],
    imports: [CommonModule, TagsModule],
    exports: [LineStatusTagComponent],
})
export class LineStatusTagModule {}
