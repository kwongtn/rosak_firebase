import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { ContentComponent } from "./content/content.component";

// import { SituasiComponent } from "./situasi.component";

const routes: Routes = [
    { path: "", component: ContentComponent },
    { path: ":lineId/:assetType/:assetId", component: ContentComponent },
];
@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class SituasiRoutingModule {}
