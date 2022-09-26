import { DataTableModule, TagsModule } from "ng-devui";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    VehicleStatusPipeModule,
} from "../pipes/vehicle-status/vehicle-status.module";
import {
    ConsoleEventsTableComponent,
} from "./events-table/events-table.component";
import { ConsoleMainComponent } from "./main/main.component";

@NgModule({
    declarations: [ConsoleMainComponent, ConsoleEventsTableComponent],
    imports: [
        CommonModule,
        DataTableModule,
        TagsModule,
        VehicleStatusPipeModule,
    ],
})
export class ConsoleModule {}
