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
import { InsidenMainComponent } from "./insiden/insiden.component";
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
    insiden: MaintenanceElement;
    profile: MaintenanceElement;
    console: MaintenanceElement;
}

const maintenance: MaintananceDocument = {
    spotting: {
        curentlyInMaintenance: false,
    },
    insiden: {
        curentlyInMaintenance: false,
    },
    profile: {
        curentlyInMaintenance: false,
    },
    console: {
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
        path: "insiden",
        title: "MLPTF | Insiden",
        loadChildren: async () => {
            if (maintenance.insiden.curentlyInMaintenance) {
                const module = await import(
                    "./construction/construction.module"
                );
                return module.ConstructionModule;
            } else {
                const module = await import("./insiden/insiden.module");
                return module.InsidenModule;
            }
        },
        component: maintenance.spotting.curentlyInMaintenance
            ? ConstructionComponent
            : InsidenMainComponent,
    },
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
        loadChildren: async () => {
            if (maintenance.console.curentlyInMaintenance) {
                const module = await import(
                    "./construction/construction.module"
                );
                return module.ConstructionModule;
            } else {
                const module = await import("./console/console.module");
                return module.ConsoleModule;
            }
        },
        component: maintenance.console.curentlyInMaintenance
            ? ConstructionComponent
            : ConsoleMainComponent,
        ...canActivate(adminOnly),
    },
    {
        path: "profile",
        title: "MLPTF | Profile",
        loadChildren: async () => {
            if (maintenance.console.curentlyInMaintenance) {
                const module = await import(
                    "./construction/construction.module"
                );
                return module.ConstructionModule;
            } else {
                const module = await import("./profile/profile.module");
                return module.ProfileModule;
            }
        },
        component: maintenance.profile.curentlyInMaintenance
            ? ConstructionComponent
            : ProfileMainComponent,
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
    imports: [
        RouterModule.forRoot(routes, {
            scrollPositionRestoration: "enabled",
        }),
    ],
    exports: [RouterModule],
})
export class AppRoutingModule {}
