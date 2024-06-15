import { NgModule } from "@angular/core";
import {
    AuthPipe,
    canActivate,
    hasCustomClaim,
    redirectUnauthorizedTo,
} from "@angular/fire/auth-guard";
import { RouterModule, Routes } from "@angular/router";

import { ConsoleMainComponent } from "./console/console.component";
import { ConstructionComponent } from "./construction/construction.component";
import { GalleryComponent } from "./gallery/gallery.component";
import { InsidenMainComponent } from "./insiden/insiden.component";
import { SituasiComponent } from "./situasi/situasi.component";
import { SpottingMainComponent } from "./spotting/spotting-main.component";

interface MaintenanceElement {
    curentlyInMaintenance: boolean;
    notes?: string | undefined;
}

type PageType =
    | "console"
    | "gallery"
    | "insiden"
    | "profile"
    | "situasi"
    | "spotting";

type MaintananceDocument = {
    [key in PageType]: MaintenanceElement;
};

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
    gallery: {
        curentlyInMaintenance: false,
    },
    situasi: {
        curentlyInMaintenance: false,
    },
};

function redirectUnauthorizedToSpotting(): AuthPipe {
    return redirectUnauthorizedTo(["spotting"]);
}

function adminOnly(): AuthPipe {
    return hasCustomClaim("admin");
}

function betaTesterOnly(): AuthPipe {
    return hasCustomClaim("betaTester");
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
        path: "gallery",
        title: "MLPTF | Gallery",
        loadChildren: async () => {
            if (maintenance.gallery.curentlyInMaintenance) {
                const module = await import(
                    "./construction/construction.module"
                );
                return module.ConstructionModule;
            } else {
                const module = await import("./gallery/gallery.module");
                return module.GalleryModule;
            }
        },
        component: maintenance.spotting.curentlyInMaintenance
            ? ConstructionComponent
            : GalleryComponent,
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
        path: "situasi",
        title: "MLPTF | Situasi",
        loadChildren: async () => {
            if (maintenance.situasi.curentlyInMaintenance) {
                const module = await import(
                    "./construction/construction.module"
                );
                return module.ConstructionModule;
            } else {
                const module = await import("./situasi/situasi.module");
                return module.SituasiModule;
            }
        },
        component: maintenance.spotting.curentlyInMaintenance
            ? ConstructionComponent
            : SituasiComponent,
        ...canActivate(betaTesterOnly),
    },
    {
        path: "about",
        title: "MLPTF | About",
        loadComponent: () => {
            if (maintenance.spotting.curentlyInMaintenance) {
                return import("./construction/construction.component").then(
                    (m) => m.ConstructionComponent
                );
            } else {
                return import("./about/about.component").then(
                    (m) => m.AboutComponent
                );
            }
        },
    },
    {
        path: "compliance",
        title: "MLPTF | Compliance",
        loadComponent: () => {
            return import("./compliance/compliance.component").then(
                (c) => c.ComplianceComponent
            );
        },
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
        loadComponent: () => {
            if (maintenance.spotting.curentlyInMaintenance) {
                return import("./construction/construction.component").then(
                    (m) => m.ConstructionComponent
                );
            } else {
                return import("./profile/profile.component").then(
                    (m) => m.ProfileMainComponent
                );
            }
        },
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
        loadComponent: () =>
            import("./fallback/fallback.component").then(
                (m) => m.FallbackComponent
            ),
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
