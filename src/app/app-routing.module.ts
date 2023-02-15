import { NgModule } from "@angular/core";
import {
    AuthPipe,
    canActivate,
    hasCustomClaim,
    redirectUnauthorizedTo,
} from "@angular/fire/compat/auth-guard";
import { RouterModule, Routes } from "@angular/router";

import { AboutComponent } from "./about/about.component";
import {
    MainComponent as ComplianceMainComponent,
} from "./compliance/main/main.component";
import { ConsoleMainComponent } from "./console/main/main.component";
import { ConstructionComponent } from "./construction/construction.component";
import { FallbackComponent } from "./fallback/fallback.component";
import { JejakMainComponent } from "./jejak/main/main.component";
import { ProfileMainComponent } from "./profile/main/main.component";
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

function redirectUnauthorizedToSpotting(): AuthPipe {
    return redirectUnauthorizedTo(["spotting"]);
}

function adminOnly(): AuthPipe {
    return hasCustomClaim("admin");
}

const routes: Routes = [
    {
        path: "spotting",
        title: "MLPTF | TranSPOT",
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
        title: "MLPTF | TranSPOT",
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
        path: "jejak",
        title: "MLPTF | Jejak",
        loadChildren: () =>
            import("./jejak/jejak.module").then((m) => m.JejakModule),
        component: JejakMainComponent,
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
        path: "console",
        title: "MLPTF | Console",
        loadChildren: () =>
            import("./console/console.module").then((m) => m.ConsoleModule),
        component: ConsoleMainComponent,
        ...canActivate(adminOnly),
    },
    {
        path: "profile",
        title: "MLPTF | Profile",
        loadChildren: () =>
            import("./profile/profile.module").then((m) => m.ProfileModule),
        component: ProfileMainComponent,
        ...canActivate(redirectUnauthorizedToSpotting),
    },
    {
        path: "",
        redirectTo: "/spotting",
        pathMatch: "full",
    },
    {
        path: "transpot",
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
