import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { ConstructionComponent } from "./construction/construction.component";
import { FallbackComponent } from "./fallback/fallback.component";
import {
    SpottingMainComponent,
} from "./spotting/spotting-main/spotting-main.component";

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
        path: "spotting/:id",
        loadChildren: async () => {
            const module = await import("./spotting/spotting.module");
            return module.SpottingModule;
        },
        component: SpottingMainComponent,
    },
    {
        path: "about",
        loadChildren: () =>
            import("./construction/construction.module").then(
                (m) => m.ConstructionModule
            ),
        component: ConstructionComponent,
        // loadChildren: () =>
        //     import("./about/about.module").then((m) => m.AboutModule),
    },
    {
        path: "",
        redirectTo: "/spotting",
        pathMatch: "full",
    },
    {
        path: "**",
        loadChildren: () =>
            import("./fallback/fallback.module").then((m) => m.FallbackModule),
        component: FallbackComponent,
    },
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule {}
