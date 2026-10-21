import { Routes } from "@angular/router";

import { HomeStore } from "./data/home.store";
import { HomeViewModeService } from "./data/home-view-mode.service";
import { LineStatusSheetService } from "./data/line-status-sheet.service";
import { HomePage } from "./home.page";

export const HOME_ROUTES: Routes = [
  {
    // Route-scoped providers, not root singletons: the polling beat and the status sheet's
    // state are created with the page and paused with it (HomePage calls stop()). The route's
    // injector outlives the recreated page component, so HomeStore.start() resumes the beat and
    // revalidates on re-entry rather than assuming a fresh store.
    // The shared line list used by the report form now comes from the root-provided
    // SpottingLinesStore.
    //
    // HomeViewModeService is route-scoped for the same reason, and for one more: it reads
    // ActivatedRoute, and ONE answer to "which view is this page in" has to be shared by the page
    // (which picks between two entirely different layouts) and the board (which owns the toggle).
    //
    // They live in this lazily loaded file, not in app.routes.ts, so the store, its queries, the
    // methodology registry and Firebase Auth stay out of the initial bundle. `component` (not
    // loadComponent) keeps the page in this same chunk: one fetch for the initial route, not two.
    path: "",
    component: HomePage,
    providers: [HomeStore, HomeViewModeService, LineStatusSheetService],
  },
];
