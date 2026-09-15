import { Routes } from "@angular/router";

export const INSIDEN_ROUTES: Routes = [
  {
    path: "",
    loadComponent: () =>
      import("./insiden-shell/insiden-shell.component").then((m) => m.InsidenShellComponent),
  },
];
