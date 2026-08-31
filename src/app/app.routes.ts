import { Routes } from "@angular/router";
import { pathWithOptionalParamMatcher } from "./core/routing/optional-param-matcher";
import { HoverPreloadStrategy } from "./core/routing/hover-preload.strategy";
import { RECAPTCHA_V3_SITE_KEY, ReCaptchaV3Service, RecaptchaLoaderService } from "ng-recaptcha-2";
import { provideMarkdown } from "ngx-markdown";
import { environment } from "../environments/environment";

export const routes: Routes = [
  {
    path: "",
    redirectTo: "/spotting",
    pathMatch: "full",
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
    // Renders CalendarIncident.details on /insiden. Mermaid/KaTeX/Prism/emoji extensions
    // deliberately left off — no incident content uses them today, and each pulls in a sizeable
    // extra dependency; trivial to add later if a real incident writeup needs one. Moved here
    // from the root appConfig so ngx-markdown drops out of the initial bundle (it's only needed
    // on this lazy route).
    providers: [provideMarkdown()],
  },
  {
    path: "console",
    title: "MLPTF | Console",
    loadChildren: () => import("./features/console/console.routes").then((m) => m.CONSOLE_ROUTES),
    // Only console's markAsRead mutation needs this today — the backend still actively enforces
    // IsRecaptchaChallengePassed there (unlike addEvent, where it's been disabled server-side).
    // ng-recaptcha-2's own services are plain `@Injectable()` with no `providedIn` — unlike most
    // Angular libraries, importing the class isn't enough; they need explicit registration here,
    // or `inject(ReCaptchaV3Service)` in ConsolePage throws NG0201 (confirmed: this crashed SSR
    // rendering entirely for /console, surfacing as a plain Express 404 rather than any visible
    // Angular error). Moved here from the root appConfig so ng-recaptcha-2 drops out of the
    // initial bundle (it's only needed on this lazy route).
    providers: [
      { provide: RECAPTCHA_V3_SITE_KEY, useValue: environment.captcha.siteKey },
      ReCaptchaV3Service,
      RecaptchaLoaderService,
    ],
  },
  {
    path: "**",
    title: "MLPTF | Page not found",
    loadComponent: () => import("./features/not-found/not-found.page").then((m) => m.NotFoundPage),
  },
];
