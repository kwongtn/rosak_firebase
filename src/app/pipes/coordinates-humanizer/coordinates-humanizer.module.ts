import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { CoordinatesHumanizerPipe } from "./coordinates-humanizer.pipe";

@NgModule({
    declarations: [CoordinatesHumanizerPipe],
    imports: [CommonModule],
    exports: [CoordinatesHumanizerPipe],
})
export class CoordinatesHumanizerModule {}
