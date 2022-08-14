import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { AboutComponent } from "./about/about/about.component";
import { ConstructionComponent } from "./construction/construction.component";
import { FallbackComponent } from "./fallback/fallback.component";

const routes: Routes = [
    {
        path: "spotting",
        data: {
            title: "'MLPTF | Spotting'",
        },
        // loadChildren: async () => {
        //     const module = await import("./spotting/spotting.module");
        //     return module.SpottingModule;
        // },
        // component: SpottingMainComponent,
        loadChildren: async () => {
            const module = await import("./construction/construction.module");
            return module.ConstructionModule;
        },
        component: ConstructionComponent,
    },
    {
        path: "spotting/:id",
        data: {
            title: "'MLPTF | Spotting'",
        },
        // loadChildren: async () => {
        //     const module = await import("./spotting/spotting.module");
        //     return module.SpottingModule;
        // },
        // component: SpottingMainComponent,
        loadChildren: async () => {
            const module = await import("./construction/construction.module");
            return module.ConstructionModule;
        },
        component: ConstructionComponent,
    },
    {
        path: "about",
        data: {
            title: "'MLPTF | About'",
        },
        loadChildren: () =>
            import("./about/about.module").then((m) => m.AboutModule),
        component: AboutComponent,
    },
    {
        path: "",
        redirectTo: "/spotting",
        pathMatch: "full",
    },
    {
        path: "**",
        data: {
            title: "'MLPTF | Page not Found'",
        },
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
