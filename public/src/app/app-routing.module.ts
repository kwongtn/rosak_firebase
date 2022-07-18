import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { SpottingMainComponent } from "./spotting/spotting-main/spotting-main.component";

const routes: Routes = [
    {
        path: "spotting",
        loadChildren: async () => {
            const module = await import("./spotting/spotting.module");
            return module.SpottingModule;
        },
        component: SpottingMainComponent,
    },
    {
        path: "about",
        loadChildren: () =>
            import("./about/about.module").then((m) => m.AboutModule),
    },
    {
        path: "",
        redirectTo: "",
        pathMatch: "full",
    },
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule {}
