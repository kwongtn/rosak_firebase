import { Routes } from "@angular/router";
import { pathWithOptionalParamMatcher } from "./core/routing/optional-param-matcher";
import { HoverPreloadStrategy } from "./core/routing/hover-preload.strategy";
import { HomeStore } from "./features/home/data/home.store";
import { LineStatusSheetService } from "./features/home/data/line-status-sheet.service";
import { SpottingLinesStore } from "./features/spotting/data/spotting-lines.store";

export const routes: Routes = [
  {
    // Route-scoped providers, not root singletons: the polling beat and the status sheet's
    // state must be created with the page and torn down with it (HomePage calls stop()).
    // SpottingLinesStore is route-scoped by the spotting feature, but the report form it backs
    // is hosted on this page too, so the store is provided here as well.
    path: "",
    loadComponent: () => import("./features/home/home.page").then((m) => m.HomePage),
    providers: [HomeStore, LineStatusSheetService, SpottingLinesStore],
  },
  {
    path: "spotting",
    title: "MLPTF | TranSPOT",
    loadChildren: () =>
      import("./features/spotting/spotting.routes").then((m) => m.SPOTTING_ROUTES),
  },
  {
    path: "profile",
    title: "MLPTF | Profile",
    loadChildren: () => import("./features/profile/profile.routes").then((m) => m.PROFILE_ROUTES),
  },
  {
    path: "tracker",
    title: "MLPTF | Tracker",
    loadChildren: () => import("./features/tracker/tracker.routes").then((m) => m.TRACKER_ROUTES),
    data: { preload: "hover" },
  },
  {
    path: "about",
    title: "MLPTF | About",
    loadComponent: () => import("./features/about/about.page").then((m) => m.AboutPage),
  },
  {
    path: "gdpr",
    title: "MLPTF | GDPR",
    loadComponent: () => import("./features/gdpr/gdpr.page").then((m) => m.GdprPage),
  },
  {
    path: "methodology",
    title: "MLPTF | Methodology",
    loadComponent: () =>
      import("./features/methodology/methodology.page").then((m) => m.MethodologyPage),
  },
  {
    // Matches /gallery and /gallery/:mediaId as ONE route rather than two sibling entries — see
    // the matcher's own doc comment for why that distinction matters here: the default
    // RouteReuseStrategy would otherwise destroy and recreate GalleryPage on every photo
    // open/close, discarding its already-loaded feed instead of just updating `mediaIdParam`.
    matcher: pathWithOptionalParamMatcher("gallery", "mediaId"),
    title: "MLPTF | Gallery",
    loadComponent: () => import("./features/gallery/gallery.page").then((m) => m.GalleryPage),
  },
  {
    // Same reasoning as /gallery above. /insiden alone defaults to today (see InsidenPage's
    // `dateParam` input) rather than redirecting into a dated URL, so the common case doesn't
    // wear a date in its address bar that's just "today" restated.
    matcher: pathWithOptionalParamMatcher("insiden", "date"),
    title: "MLPTF | Insiden",
    loadComponent: () => import("./features/insiden/insiden.page").then((m) => m.InsidenPage),
  },
  {
    path: "console",
    title: "MLPTF | Console",
    loadChildren: () => import("./features/console/console.routes").then((m) => m.CONSOLE_ROUTES),
  },
  {
    path: "**",
    title: "MLPTF | Page not found",
    loadComponent: () => import("./features/not-found/not-found.page").then((m) => m.NotFoundPage),
  },
];
