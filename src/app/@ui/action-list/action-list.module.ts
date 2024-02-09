import { NzListModule } from "ng-zorro-antd/list";
import { NzSpaceModule } from "ng-zorro-antd/space";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    SpottingTypeTagModule,
} from "../spotting-type-tag/spotting-type-tag.module";
import {
    VehicleStatusTagModule,
} from "../vehicle-status-tag/vehicle-status-tag.module";
import { ActionListComponent } from "./action-list.component";

@NgModule({
    declarations: [ActionListComponent],
    imports: [
        CommonModule,

        // ng-zorro
        NzListModule,
        NzSpaceModule,

        // Internal Imports
        SpottingTypeTagModule,
        VehicleStatusTagModule,
    ],
    exports: [ActionListComponent],
})
export class ActionListModule {}
