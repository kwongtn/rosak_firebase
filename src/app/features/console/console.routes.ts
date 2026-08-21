import { Routes } from "@angular/router";
import { adminOnlyGuard } from "../../core/auth/admin-only.guard";

export const CONSOLE_ROUTES: Routes = [
  {
    path: "",
    canActivate: [adminOnlyGuard],
    loadComponent: () => import("./console.page").then((m) => m.ConsolePage),
  },
  {
    path: "insiden/pending",
    canActivate: [adminOnlyGuard],
    loadComponent: () =>
      import("./insiden/pending/pending.component").then((m) => m.PendingIncidentsComponent),
  },
  {
    path: "insiden/links",
    canActivate: [adminOnlyGuard],
    loadComponent: () =>
      import("./insiden/links/links.component").then((m) => m.SocialMediaLinksComponent),
  },
];
