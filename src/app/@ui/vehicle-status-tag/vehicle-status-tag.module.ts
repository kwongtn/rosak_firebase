import { TagsModule } from "ng-devui";
import {
    VehicleStatusPipe,
} from "src/app/pipes/vehicle-status/vehicle-status.pipe";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { VehicleStatusTagComponent } from "./vehicle-status-tag.component";

@NgModule({
    declarations: [VehicleStatusTagComponent],
    imports: [CommonModule, VehicleStatusPipe, TagsModule],
    exports: [VehicleStatusTagComponent],
})
export class VehicleStatusTagModule {}
