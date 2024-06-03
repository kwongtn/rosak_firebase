import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { TrackerMapComponent } from "./map/map.component";

const routes: Routes = [
    {
        path: "",
        component: TrackerMapComponent,
    },
];
@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class TrackerRoutingModule {}
