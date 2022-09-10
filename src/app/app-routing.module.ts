import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { AboutComponent } from "./about/about/about.component";
import {
    MainComponent as ComplianceMainComponent,
} from "./compliance/main/main.component";
import { ConstructionComponent } from "./construction/construction.component";
import { FallbackComponent } from "./fallback/fallback.component";
import {
    SpottingMainComponent,
} from "./spotting/spotting-main/spotting-main.component";

interface MaintenanceElement {
    curentlyInMaintenance: boolean;
    notes?: string | undefined;
}

interface MaintananceDocument {
    spotting: MaintenanceElement;
}

const maintenance: MaintananceDocument = {
    spotting: {
        curentlyInMaintenance: false,
    },
};

const routes: Routes = [
    {
        path: "spotting",
        title: "MLPTF | Spotting",
        loadChildren: async () => {
            if (maintenance.spotting.curentlyInMaintenance) {
                const module = await import(
                    "./construction/construction.module"
                );
                return module.ConstructionModule;
            } else {
                const module = await import("./spotting/spotting.module");
                return module.SpottingModule;
            }
        },
        component: maintenance.spotting.curentlyInMaintenance
            ? ConstructionComponent
            : SpottingMainComponent,
    },
    {
        path: "spotting/:id",
        title: "MLPTF | Spotting",
        loadChildren: async () => {
            if (maintenance.spotting.curentlyInMaintenance) {
                const module = await import(
                    "./construction/construction.module"
                );
                return module.ConstructionModule;
            } else {
                const module = await import("./spotting/spotting.module");
                return module.SpottingModule;
            }
        },
        component: maintenance.spotting.curentlyInMaintenance
            ? ConstructionComponent
            : SpottingMainComponent,
    },
    {
        path: "about",
        title: "MLPTF | About",
        loadChildren: () =>
            import("./about/about.module").then((m) => m.AboutModule),
        component: AboutComponent,
    },
    {
        path: "compliance",
        title: "MLPTF | Compliance",
        loadChildren: () =>
            import("./compliance/compliance.module").then(
                (m) => m.ComplianceModule
            ),
        component: ComplianceMainComponent,
    },
    {
        path: "",
        redirectTo: "/spotting",
        pathMatch: "full",
    },
    {
        path: "**",
        title: "MLPTF | Page not Found",
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
