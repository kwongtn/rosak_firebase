import { Component, computed, inject, input, signal } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { CONSOLE_LINKS, NAV_LINKS } from "../nav-config";
import { BrandLogoComponent } from "../brand-logo/brand-logo.component";
import { ConsoleMenuComponent } from "../console-menu/console-menu.component";
import { ReportBugButtonComponent } from "../report-bug-button/report-bug-button.component";
import { ThemeToggleComponent } from "../../ui/theme-toggle/theme-toggle.component";
import { OfflineStripComponent } from "../offline-strip/offline-strip.component";

/**
 * Compact floating nav pill for full-bleed pages (currently `/tracker`) that don't want the
 * full-width `<app-nav>` eating into their viewport. It's deliberately a compact *rendering* of
 * the same cross-feature nav — same link set + permission gates as `<app-nav>` — minus whichever
 * module is currently active, so a module never lists itself as a navigation option (the current
 * module is already shown in the pill's brand/logo trigger, so a second entry would be redundant).
 *
 * `currentModulePath` / `currentModuleLabel` are the only per-page inputs: a future full-bleed
 * module reuses this exact pill by passing its own path + label, and the self-exclusion falls out
 * automatically because the link list is filtered against `currentModulePath` rather than
 * hardcoded per page.
 */
@Component({
  selector: "app-compact-nav",
  imports: [
    RouterLink,
    RouterLinkActive,
    BrandLogoComponent,
    ConsoleMenuComponent,
    OfflineStripComponent,
    ReportBugButtonComponent,
    ThemeToggleComponent,
  ],
  template: `
    <!-- max-w: room for the AntV logo parked in the top-right on mobile (see styles.css)
         instead of the two fighting for the same row. flex-wrap on the top row is a safety
         net for a narrow *desktop* width (above the sm breakpoint, where every link still
         renders inline) rather than the primary mobile answer — below that breakpoint, the
         other links are hidden behind the chevron toggle instead (see navExpanded), expanding as a
         vertical list beneath this row rather than wrapping inline, so the pill stays a
         predictable one- or two-row shape instead of growing wide and colliding with
         whatever's on the other side of the screen (the layer panel, most narrow-desktop-
         width's real complaint) the more links get added to it. -->
    <div
      class="bg-background/90 absolute top-3 left-3 z-10 flex max-w-[calc(100vw-5rem)] flex-col rounded-lg px-3 py-1.5 text-sm shadow sm:max-w-[calc(100vw-1.5rem)]"
    >
      <div class="flex flex-wrap items-center gap-3">
        <!-- A <button>, not an <a>: this shell only ever renders on its own module, so a
             routerLink back to the same route is always a no-op navigation — freeing this whole
             module name + logo up to double as the mobile dropdown trigger (see navExpanded)
             instead of that trigger being just the small chevron off to the side. The chevron
             itself stays sm:hidden — on desktop this click toggles a signal nothing below reads
             (the expanded-links block and the chevron are both sm:hidden too), so it's a harmless
             no-op there, same as a routerLink would be. -->
        <button
          type="button"
          class="flex items-center gap-1.5 font-semibold"
          [attr.aria-expanded]="navExpanded()"
          [attr.aria-label]="currentModuleLabel() + ' — more links'"
          (click)="navExpanded.set(!navExpanded())"
        >
          <svg app-brand-logo class="h-5 w-auto"></svg>
          {{ currentModuleLabel() }}
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0 transition-transform duration-150 sm:hidden"
            [class.rotate-180]="navExpanded()"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <!-- Desktop: every link inline, as before. The link set is the module nav list with the
             current module filtered out (see moduleLinks), so the active module never appears as a
             selectable option — same link set + permission gates as the global <app-nav>, just a
             compact rendering of it. -->
        @for (link of moduleLinks(); track link.path) {
          <a
            [routerLink]="link.path"
            class="text-muted-foreground hover:text-foreground hidden sm:inline"
            >{{ link.label }}</a
          >
        }
        @if (auth.isLoggedIn()) {
          <a
            routerLink="/profile"
            class="text-muted-foreground hover:text-foreground hidden sm:inline"
            >Profile</a
          >
        }
        @if (auth.isAdmin()) {
          <div app-console-menu class="hidden sm:block"></div>
        }

        <!-- Same "Report a bug" button as the global <app-nav>'s icon tray — the compact pill has its
             own because it keeps its own nav instead of <app-nav>. -->
        <button app-report-bug-button class="size-7"></button>
        <app-theme-toggle />
      </div>

      @if (navExpanded()) {
        <div class="mt-2 flex flex-col gap-2 border-t pt-2 sm:hidden">
          @for (link of moduleLinks(); track link.path) {
            <a
              [routerLink]="link.path"
              class="text-muted-foreground hover:text-foreground"
              (click)="navExpanded.set(false)"
              >{{ link.label }}</a
            >
          }
          @if (auth.isLoggedIn()) {
            <a
              routerLink="/profile"
              class="text-muted-foreground hover:text-foreground"
              (click)="navExpanded.set(false)"
              >Profile</a
            >
          }
          @if (auth.isAdmin()) {
            <a
              routerLink="/console/spotting"
              routerLinkActive="font-medium"
              [routerLinkActiveOptions]="{ exact: true }"
              class="text-destructive hover:text-destructive/80"
              (click)="navExpanded.set(false)"
              >Console</a
            >
            <div class="text-muted-foreground flex flex-col gap-1 pl-4 text-sm font-medium">
              @for (link of consoleLinks; track link.path) {
                <a
                  [routerLink]="link.path"
                  routerLinkActive="text-foreground font-medium"
                  [routerLinkActiveOptions]="{ exact: link.exact }"
                  class="hover:text-foreground text-sm font-normal"
                  (click)="navExpanded.set(false)"
                >
                  {{ link.label }}
                </a>
              }
            </div>
          }
        </div>
      }
      <!-- Bleeds to the pill's edges (cancelling its px-3/py-1.5) so the strip reads as the pill's
           bottom band; the margins net to zero height while the strip is empty. -->
      <app-offline-strip class="-mx-3 mt-1.5 -mb-1.5 overflow-hidden rounded-b-lg" />
    </div>
  `,
})
export class CompactNavComponent {
  protected readonly auth = inject(AuthService);
  protected readonly consoleLinks = CONSOLE_LINKS;

  /** Path of the module this pill is rendered on (e.g. "/tracker"). Its link is filtered out of
   * `moduleLinks()` so the current module never appears as a selectable option. */
  readonly currentModulePath = input.required<string>();
  /** Visible module name shown in the brand/logo trigger (e.g. "Tracker"). */
  readonly currentModuleLabel = input.required<string>();

  /** The cross-feature module links, with the current module removed — what actually renders in
   * both the desktop inline row and the mobile expanded list. */
  protected readonly moduleLinks = computed(() =>
    NAV_LINKS.filter((l) => l.path !== this.currentModulePath()),
  );

  /** Below the sm breakpoint, whether the collapsed nav pill's other links are currently shown
   * as a vertical list under the top row. */
  protected readonly navExpanded = signal(false);
}
