import { Routes } from "@angular/router";
import { adminOnlyGuard } from "../../core/auth/admin-only.guard";

export const CONSOLE_ROUTES: Routes = [
  {
    // The spotting queue's canonical URL is /console/spotting (spec F3) — the bare console
    // root redirects there so old /console bookmarks/deep-links still land. `pathMatch: "full"`
    // is mandatory: without it the empty-path redirect would also swallow /console/insiden/*.
    // No canActivate here — Angular forbids guards on redirect routes (redirects run first) —
    // the redirect target /console/spotting is guarded, so /console is guarded transitively.
    path: "",
    pathMatch: "full",
    redirectTo: "spotting",
  },
  {
    path: "spotting",
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
