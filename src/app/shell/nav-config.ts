/** A single console sub-section link — shared between `<app-nav>` (hover dropdown, collapsed
 * module-menu dropdown, mobile sheet) and `/tracker`'s own compact nav pill, so both surfaces
 * render the same Console sub-links from one source instead of drifting apart. */
export interface ConsoleLink {
  path: string;
  label: string;
  /** "/console" is a prefix of every other console route, so it alone needs an exact match —
   * see console-nav.component.ts, which this mirrors. */
  exact: boolean;
}

/** Single source of truth for the console's sub-sections — read by app-nav's hover dropdown,
 * its expanded inline nested menu, its mobile sheet's sub-group, and tracker-shell's own
 * compact-nav dropdown/mobile list, so adding a new console section here makes it show up
 * everywhere automatically. */
export const CONSOLE_LINKS: ConsoleLink[] = [
  { path: "/console", label: "Spotting Queue", exact: true },
  { path: "/console/insiden/pending", label: "Incident Approval", exact: false },
  { path: "/console/insiden/links", label: "Social Media Links", exact: false },
];
