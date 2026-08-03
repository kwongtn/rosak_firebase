import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { LineComponent } from "./line/line.component";
import { OverallComponent } from "./overall/overall.component";
import { StationDetailsComponent } from "./station-details/station-details.component";
import { StationsComponent } from "./stations/stations.component";
import { VehicleDetailsComponent } from "./vehicle-details/vehicle-details.component";
import { VehiclesComponent } from "./vehicles/vehicles.component";

const routes: Routes = [
    {
        path: "",
        loadChildren: async () => {
            const module = await import("./overall/overall.module");
            return module.OverallModule;
        },
        component: OverallComponent,
    },
    {
        path: ":lineId",
        loadChildren: async () => {
            const module = await import("./line/line.module");
            return module.LineModule;
        },
        component: LineComponent,
    },
    {
        path: ":lineId/vehicles",
        loadChildren: async () => {
            const module = await import("./vehicles/vehicles.module");
            return module.VehiclesModule;
        },
        component: VehiclesComponent,
    },
    {
        path: ":lineId/vehicles/:tabName",
        loadChildren: async () => {
            const module = await import("./vehicles/vehicles.module");
            return module.VehiclesModule;
        },
        component: VehiclesComponent,
    },
    {
        path: ":lineId/station",
        loadChildren: async () => {
            const module = await import("./stations/stations.module");
            return module.StationsModule;
        },
        component: StationsComponent,
    },
    {
        path: ":lineId/vehicle/:assetId",
        loadChildren: async () => {
            const module = await import(
                "./vehicle-details/vehicle-details.module"
            );
            return module.VehicleDetailsModule;
        },
        component: VehicleDetailsComponent,
    },
    {
        path: ":lineId/station/:assetId",
        loadChildren: async () => {
            const module = await import(
                "./station-details/station-details.module"
            );
            return module.StationDetailsModule;
        },
        component: StationDetailsComponent,
    },
];
@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class SituasiRoutingModule {}
