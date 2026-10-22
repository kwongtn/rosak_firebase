import { Routes } from "@angular/router";
import { redirectToOwnProfileGuard } from "../../core/auth/redirect-to-own-profile.guard";

export const PROFILE_ROUTES: Routes = [
  {
    path: "",
    canActivate: [redirectToOwnProfileGuard],
    loadComponent: () => import("./profile.page").then((m) => m.ProfilePage),
  },
  {
    // Public: the owner sees their own data, a visitor sees `publicUser(id)` (see ProfilePage).
    path: ":id",
    loadComponent: () => import("./profile.page").then((m) => m.ProfilePage),
  },
];
