import { NzGridModule } from "ng-zorro-antd/grid";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { TrackerMapComponent } from "./map/map.component";
import { TrackerRoutingModule } from "./tracker-routing.module";
import { TrackerComponent } from "./tracker.component";

@NgModule({
    declarations: [TrackerComponent],
    imports: [
        CommonModule,
        NzGridModule,
        TrackerMapComponent,
        TrackerRoutingModule,
    ],
    providers: [],
})
export class TrackerModule {}
