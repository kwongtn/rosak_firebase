/** A single console sub-section link — shared between `<app-nav>` (hover dropdown, collapsed
 * module-menu dropdown, mobile sheet), `/tracker`'s own compact nav pill and the console pages'
 * own `<app-console-nav>` switcher, so every surface renders the same Console sub-links from one
 * source instead of drifting apart. */
export interface ConsoleLink {
  path: string;
  label: string;
  /** Only the spotting queue's path is exact — the bare /console redirects to
   * /console/spotting, so a link to /console would never highlight on the canonical URL. */
  exact: boolean;
}

/** Single source of truth for the console's sub-sections — read by app-nav's hover dropdown,
 * its expanded inline nested menu, its mobile sheet's sub-group, tracker-shell's own
 * compact-nav dropdown/mobile list and the console pages' `<app-console-nav>`, so adding a new
 * console section here makes it show up everywhere automatically. */
export const CONSOLE_LINKS: ConsoleLink[] = [
  { path: "/console/spotting", label: "Spotting Queue", exact: true },
  { path: "/console/insiden/pending", label: "Incident Approval", exact: false },
  { path: "/console/links", label: "Social Media Links", exact: false },
];

/** A single cross-feature module link rendered by `<app-nav>` (inline row, collapsed dropdown and
 * mobile sheet) and by the compact floating nav pill. `exact` feeds `routerLinkActiveOptions` —
 * only Home matches exactly. */
export interface NavLink {
  path: string;
  label: string;
  exact: boolean;
}

/** Single source of truth for the cross-feature module links, in display order — read by
 * `<app-nav>` and its `moduleLabelFor`, and by the compact nav pill (the one `/tracker` keeps
 * instead of the full-width `<app-nav>`). The compact nav renders these *minus* whichever module
 * is currently active (passed to the component as `currentModulePath`), so a module never lists
 * itself as a navigation option — the current module is already shown in the pill's brand/logo
 * trigger, so a second entry would be redundant. Adding a module here makes it appear in both
 * navs automatically. */
export const NAV_LINKS: NavLink[] = [
  { path: "/", label: "Home", exact: true },
  { path: "/spotting", label: "TranSPOT", exact: false },
  { path: "/tracker", label: "Tracker", exact: false },
  { path: "/gallery", label: "Gallery", exact: false },
  { path: "/insiden", label: "Insiden", exact: false },
  { path: "/about", label: "About", exact: false },
];
