import { RenderMode, ServerRoute } from "@angular/ssr";

export const serverRoutes: ServerRoute[] = [
  // The '' → '/spotting' redirect (see app.routes.ts) needs its own entry here, ahead of the
  // wildcard's 404 status below — without it, this path has no more specific match in *this*
  // route tree (there's no dedicated client-route component at '' to derive one from) and would
  // otherwise fall through to the wildcard and incorrectly serve the site's own root with an
  // HTTP 404, despite rendering a perfectly valid redirect.
  {
    path: "",
    renderMode: RenderMode.Server,
  },
  // /spotting/** carries live, frequently-changing public data — good for shareable/indexable
  // links, but not a candidate for build-time prerendering (see the rewrite plan's SSR notes).
  {
    path: "spotting/**",
    renderMode: RenderMode.Server,
  },
  // /profile is entirely personal, auth-gated data — SSR can't fetch anything real for it
  // (the server always renders logged-out), so there's no SSR benefit; render client-only.
  {
    path: "profile/**",
    renderMode: RenderMode.Client,
  },
  // /tracker renders a WebGL map (@antv/l7) that requires a real browser canvas/GL context —
  // it cannot run during SSR at all.
  {
    path: "tracker/**",
    renderMode: RenderMode.Client,
  },
  // /about reads a live Firestore doc that only ever changes by hand (an admin editing it) —
  // no request-driven content to justify SSR, so render client-only like /profile.
  {
    path: "about",
    renderMode: RenderMode.Client,
  },
  // /gdpr is Firestore-driven compliance text that only ever changes by hand — same reasoning
  // as /about; render client-only.
  {
    path: "gdpr",
    renderMode: RenderMode.Client,
  },
  // /gallery is fully public with real, request-independent GraphQL data (same reasoning as
  // /spotting) — good for shareable/indexable links.
  {
    path: "gallery/**",
    renderMode: RenderMode.Server,
  },
  // /insiden/:date carries an unbounded, admin-edited date param — same reasoning as
  // /spotting/**: not prerenderable (there's no fixed set of param values to enumerate up
  // front), but genuinely live public data, so still worth serving over SSR rather than
  // falling back to client-only.
  {
    path: "insiden/**",
    renderMode: RenderMode.Server,
  },
  // /console is admin-only, auth-gated routes — SSR cannot authenticate the session, so render client-only.
  {
    path: "console/**",
    renderMode: RenderMode.Client,
  },
  // Was RenderMode.Prerender, but Angular's SSR route analysis can't statically enumerate a
  // matcher-based route (see /gallery, /insiden above) for prerendering purposes, and errors on
  // the whole tree if any route mode still claims it can. Now that '' has its own entry above,
  // this one only ever matches a genuinely unmatched path (app.routes.ts's own wildcard renders
  // NotFoundPage for it) — not content worth prerendering in the first place — so Server is a
  // safe, correct substitute either way. `status: 404` is what makes this an *actual* HTTP 404
  // to a crawler or uptime check, not just a page that reads like one to a person.
  {
    path: "**",
    renderMode: RenderMode.Server,
    status: 404,
  },
];
