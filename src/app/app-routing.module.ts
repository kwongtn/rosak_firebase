import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

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
        path: "about",
        loadChildren: () =>
            import("./about/about.module").then((m) => m.AboutModule),
    },
    {
        path: "",
        redirectTo: "",
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
