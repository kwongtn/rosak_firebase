import { Routes } from "@angular/router";
import { adminOnlyGuard } from "../../core/auth/admin-only.guard";

export const CONSOLE_ROUTES: Routes = [
    {
        path: "",
        canActivate: [adminOnlyGuard],
        loadComponent: () => import("./console.page").then((m) => m.ConsolePage),
    },
];
