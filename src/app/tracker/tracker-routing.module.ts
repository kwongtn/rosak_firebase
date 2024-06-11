import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { StatusCardComponent } from "./status-card/status-card.component";

const routes: Routes = [
    {
        path: "**",
        component: StatusCardComponent,
    },
];
@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class TrackerRoutingModule {}
