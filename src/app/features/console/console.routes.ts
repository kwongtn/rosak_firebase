import { Routes } from "@angular/router";
import { adminOnlyGuard } from "../../core/auth/admin-only.guard";

export const CONSOLE_ROUTES: Routes = [
  {
    // The spotting queue's canonical URL is /console/spotting (spec F3) — the bare console
    // root redirects there so old /console bookmarks/deep-links still land. `pathMatch: "full"`
    // is mandatory: without it the empty-path redirect would also swallow /console/insiden/*
    // and /console/links.
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
    // The links queue's canonical URL is /console/links. It used to live at
    // /console/insiden/links, and the redirect below keeps every old bookmark,
    // shared link and deep-link working.
    path: "links",
    canActivate: [adminOnlyGuard],
    loadComponent: () =>
      import("./insiden/links/links.component").then((m) => m.SocialMediaLinksComponent),
  },
  {
    // ⚠️ NO `canActivate` HERE, and never add one: Angular forbids guards on a
    // redirect route (redirects are matched before guards run, and the config is
    // rejected). The redirect TARGET (/console/links) is guarded, so the old URL
    // is guarded transitively — the same arrangement the bare /console redirect
    // above already relies on.
    path: "insiden/links",
    pathMatch: "full",
    redirectTo: "links",
  },
];
