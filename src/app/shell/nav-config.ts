/** A single console sub-section link — shared between `<app-nav>` (hover dropdown, collapsed
 * module-menu dropdown, mobile sheet) and `/tracker`'s own compact nav pill, so both surfaces
 * render the same Console sub-links from one source instead of drifting apart. */
export interface ConsoleLink {
  path: string;
  label: string;
  /** Only the spotting queue's path is exact — the bare /console redirects to
   * /console/spotting, so a link to /console would never highlight on the canonical URL.
   * See console-nav.component.ts, which this mirrors. */
  exact: boolean;
}

/** Single source of truth for the console's sub-sections — read by app-nav's hover dropdown,
 * its expanded inline nested menu, its mobile sheet's sub-group, and tracker-shell's own
 * compact-nav dropdown/mobile list, so adding a new console section here makes it show up
 * everywhere automatically. */
export const CONSOLE_LINKS: ConsoleLink[] = [
  { path: "/console/spotting", label: "Spotting Queue", exact: true },
  { path: "/console/insiden/pending", label: "Incident Approval", exact: false },
  { path: "/console/insiden/links", label: "Social Media Links", exact: false },
];

/** A single cross-feature module link shown in the compact floating nav pill (the one
 * `/tracker` keeps instead of the full-width `<app-nav>`). Shared between every page that
 * reuses the pill, so adding a module here makes it appear everywhere automatically. */
export interface ModuleNavLink {
  path: string;
  label: string;
}

/** The cross-feature module links, in display order. The compact nav renders these *minus*
 * whichever module is currently active (passed to the component as `currentModulePath`), so a
 * module never lists itself as a navigation option — the current module is already shown in the
 * pill's brand/logo trigger, so a second entry would be redundant. Keeping this list here (rather
 * than hardcoding it per page) means a future module that reuses the pill gets the same
 * self-exclusion for free just by setting its own `currentModulePath`. */
export const MODULE_NAV_LINKS: ModuleNavLink[] = [
  { path: "/spotting", label: "TranSPOT" },
  { path: "/tracker", label: "Tracker" },
  { path: "/gallery", label: "Gallery" },
  { path: "/insiden", label: "Insiden" },
  { path: "/about", label: "About" },
];
