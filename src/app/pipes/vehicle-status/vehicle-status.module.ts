import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { VehicleStatusPipePipe } from "./vehicle-status-pipe.pipe";

@NgModule({
    declarations: [VehicleStatusPipePipe],
    imports: [CommonModule],
    exports: [VehicleStatusPipePipe],
})
export class VehicleStatusPipeModule {}
