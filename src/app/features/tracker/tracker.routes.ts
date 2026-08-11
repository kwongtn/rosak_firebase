import { Routes } from "@angular/router";

export const TRACKER_ROUTES: Routes = [
  {
    path: "",
    loadComponent: () => import("./tracker-shell.page").then((m) => m.TrackerShellPage),
  },
];
