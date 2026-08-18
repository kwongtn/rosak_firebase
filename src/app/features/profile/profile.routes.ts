import { Routes } from "@angular/router";
import { redirectToOwnProfileGuard } from "../../core/auth/redirect-to-own-profile.guard";

export const PROFILE_ROUTES: Routes = [
  {
    path: "",
    canActivate: [redirectToOwnProfileGuard],
    loadComponent: () => import("./profile.page").then((m) => m.ProfilePage),
  },
  {
    // Public — anyone can view a profile by id, but ProfilePage itself only ever renders
    // real data for the signed-in owner (see its own doc comment for why: the backend has no
    // way to fetch another user's data by id today).
    path: ":id",
    loadComponent: () => import("./profile.page").then((m) => m.ProfilePage),
  },
  {
    path: ":id/settings",
    loadComponent: () => import("./settings/settings.component").then((m) => m.SettingsComponent),
  },
];
