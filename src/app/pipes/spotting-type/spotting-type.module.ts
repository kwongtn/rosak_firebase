import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { SpottingTypePipe } from "./spotting-type.pipe";

@NgModule({
    declarations: [SpottingTypePipe],
    imports: [CommonModule],
    exports: [SpottingTypePipe],
})
export class SpottingTypePipeModule {}
