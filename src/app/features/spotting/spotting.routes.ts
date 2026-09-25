import { Routes } from "@angular/router";
import { pathWithOptionalParamMatcher } from "../../core/routing/optional-param-matcher";

export const SPOTTING_ROUTES: Routes = [
  {
    path: "",
    loadComponent: () =>
      import("./spotting-shell/spotting-shell.page").then((m) => m.SpottingShellPage),
    children: [
      {
        path: "",
        loadComponent: () => import("./spotting-redirect.page").then((m) => m.SpottingRedirectPage),
      },
      {
        // Keep these three page routes mounted across spotting navigations so their DOM, scroll
        // position, and loaded resources survive a return trip (see ReusableRouteStrategy).
        path: ":lineId",
        data: { reuse: true },
        loadComponent: () =>
          import("./line-overview/line-overview.page").then((m) => m.LineOverviewPage),
      },
      {
        // Same matcher trick as /gallery and /insiden (see optional-param-matcher.ts's own doc
        // comment for why this matters): /details and /details/:tab become ONE route so the
        // default RouteReuseStrategy keeps the LineDetailsPage instance alive across tab
        // switches — a tab change only updates the `tab` input, it doesn't destroy the page and
        // refetch every resource on it. The matcher's prefix is "details" (not ":lineId/details")
        // because this entry's own path consumed the :lineId segment first, so the matcher only
        // sees the segments remaining after it.
        path: ":lineId",
        children: [
          {
            matcher: pathWithOptionalParamMatcher("details", "tab"),
            data: { reuse: true },
            loadComponent: () =>
              import("./line-details/line-details.page").then((m) => m.LineDetailsPage),
          },
        ],
      },
      {
        path: ":lineId/vehicle/:vehicleId",
        data: { reuse: true },
        loadComponent: () =>
          import("./vehicle-detail/vehicle-detail.page").then((m) => m.VehicleDetailPage),
      },
    ],
  },
];
