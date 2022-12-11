import { NzTagModule } from "ng-zorro-antd/tag";
import {
    VehicleStatusPipeModule,
} from "src/app/pipes/vehicle-status/vehicle-status.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { VehicleStatusTagComponent } from "./vehicle-status-tag.component";

@NgModule({
    declarations: [VehicleStatusTagComponent],
    imports: [
        CommonModule, 
        
        // ng-zorro-antd  
        NzTagModule,

        // Internal modules
        VehicleStatusPipeModule, 
    ],
    exports: [VehicleStatusTagComponent],
})
export class VehicleStatusTagModule {}
