import { NAV_LINKS } from "../nav-config";

export const GENERIC_TITLE = "Malaysia Land Public Transport Fans";

/** The first path segment of a router URL, query and fragment stripped — `/?view=pro` is the
 * Home segment, not `"?view=pro"`. */
export function routeSegmentOf(url: string): string {
  return url.split(/[?#]/)[0].split("/")[1] ?? "";
}

/** The nav-link label for whichever module is currently active — what shows on the collapsed
 * trigger. Matches a first-path link if one exists, then the two non-nav routes that still get a
 * name, then falls back to the generic "Menu". */
export function moduleLabelFor(segment: string): string {
  const link = NAV_LINKS.find((l) => l.path === `/${segment}`);
  if (link) {
    return link.label;
  }
  if (segment === "profile") return "Profile";
  if (segment === "console") return "Console";
  return "Menu";
}

/** The wordmark's classes: the shared base, plus the one-shot wipe-in animation when it's being
 * revealed for the first time this page load. */
export function wordmarkClassFor(animate: boolean): string {
  const base = "text-lg font-semibold whitespace-nowrap";
  return animate ? `${base} animate-wordmark-wipe` : base;
}

/** The "new version" button's width classes — a fixed label means a concrete width per state. */
export function newVersionButtonClassFor(expanded: boolean): string {
  return expanded ? "w-44 px-3" : "w-8 px-0 justify-center";
}

/** The avatar button's hover/expanded ring treatment. */
export function avatarButtonClassFor(expanded: boolean): string {
  return expanded ? "border-primary text-primary" : "";
}

/** The on-load hint's full "Welcome back, NAME" pill text. */
export function welcomeLabelText(name: string): string {
  return `Welcome back, ${name}`;
}

/** The avatar pill's visible label: "Log In" logged out, the greeting while the one-shot hint is
 * showing, otherwise just the name. */
export function avatarLabelText(args: {
  isLoggedIn: boolean;
  showHint: boolean;
  welcomeLabel: string;
  name: string;
}): string {
  if (!args.isLoggedIn) {
    return "Log In";
  }
  return args.showHint ? args.welcomeLabel : args.name;
}
