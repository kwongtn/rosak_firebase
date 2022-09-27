import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { VehicleStatusTagComponent } from "./vehicle-status-tag.component";

@NgModule({
    declarations: [VehicleStatusTagComponent],
    imports: [CommonModule],
    exports: [VehicleStatusTagComponent],
})
export class VehicleStatusTagModule {}
