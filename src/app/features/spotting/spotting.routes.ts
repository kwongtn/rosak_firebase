import { Routes } from "@angular/router";
import { SpottingLinesStore } from "./data/spotting-lines.store";

export const SPOTTING_ROUTES: Routes = [
  {
    path: "",
    providers: [SpottingLinesStore],
    loadComponent: () =>
      import("./spotting-shell/spotting-shell.page").then((m) => m.SpottingShellPage),
    children: [
      {
        path: "",
        loadComponent: () => import("./spotting-redirect.page").then((m) => m.SpottingRedirectPage),
      },
      {
        path: ":lineId",
        loadComponent: () =>
          import("./line-overview/line-overview.page").then((m) => m.LineOverviewPage),
      },
      {
        path: ":lineId/details",
        loadComponent: () =>
          import("./line-details/line-details.page").then((m) => m.LineDetailsPage),
      },
      {
        path: ":lineId/vehicle/:vehicleId",
        loadComponent: () =>
          import("./vehicle-detail/vehicle-detail.page").then((m) => m.VehicleDetailPage),
      },
    ],
  },
];
