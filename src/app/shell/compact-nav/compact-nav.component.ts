import { Component, computed, effect, inject, input, signal } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";
import * as Sentry from "@sentry/angular";
import { AuthService } from "../../core/auth/auth.service";
import { ThemeService } from "../../core/theme/theme.service";
import { CONSOLE_LINKS, MODULE_NAV_LINKS, type ModuleNavLink } from "../nav-config";
import { ThemeToggleComponent } from "../../ui/theme-toggle/theme-toggle.component";

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
  imports: [RouterLink, RouterLinkActive, ThemeToggleComponent],
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
          <svg viewBox="0 0 570.14 178.35" class="h-5 w-auto" aria-hidden="true">
            <path fill="#ee7104" d="M1.5,6.23L.29,132.87l82.39-2.27L1.5,6.23Z" />
            <path fill="#ee7104" d="M1.5,6.23l117.75,125.57,101.07-1.06L1.5,6.23Z" />
            <path fill="#ee7104" d="M1.5,6.23l275.87,125.29,247.58-2.86L1.5,6.23" />
            <path
              fill="currentColor"
              d="M0,134.4L37.77,5.22l38.17-.4,4.69,89.06L126.83,4.42l38.57-.4-19.96,127.9-27.99,.4,19.39-104.19-54.17,102.47-21.78,.38-5.87-101.33-27.57,104.15-27.46,.6Z"
            />
            <path
              fill="currentColor"
              d="M188.57,4.69l-28.33,127.05,80.12-1.14,4.36-22.25-51.61,.09L216.4,4.27l-27.82,.42Z"
            />
            <path
              fill="currentColor"
              d="M309.78,.67c-13.14,.73-22.17,2.41-33.32,4.5-1.16,7.99-27.89,126.34-27.89,126.34h28.79l9.78-46.47s16.7,1.7,38.17-2.28c14.6-7.41,19.82-7.99,29.6-22.23,3.57-5.62,11.96-20.36,2.68-41.38-7.05-12.59-25.12-17.74-47.81-18.48Zm-1.17,23.21c2.46,0,5.13,.11,7.34,.49,7.19,.31,11.83,3.31,14.87,6.03,2.05,2.05,1.87,10.45,1.87,10.45-.53,4.91-2.28,8.21-5.09,12.59-4.2,5.54-7.99,6.79-15.54,8.3-8.97,1.12-19.69,.8-19.69,.8l8.57-38.3s3.56-.35,7.66-.36h0Z"
            />
            <path
              fill="currentColor"
              d="M367.37,.94l-4.82,24.37,34.42-.13-22.1,104.46,28.39-.54,22.77-104.73h36.03l5.22-23.3-99.91-.13Z"
            />
            <path
              fill="currentColor"
              d="M476.38,.94l-28.53,128.04h28.93l11.25-52.5,46.61-.54,4.69-22.23-46.34,.27,6.96-30.67,49.96-.27,4.96-23.04-78.48,.94Z"
            />
          </svg>
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
          <div
            class="relative hidden shrink-0 sm:block"
            (mouseenter)="onConsoleMenuEnter()"
            (mouseleave)="onConsoleMenuLeave()"
          >
            <a
              routerLink="/console"
              routerLinkActive="font-medium"
              [routerLinkActiveOptions]="{ exact: true }"
              class="text-destructive hover:text-destructive/80"
              >Console</a
            >
            @if (consoleMenuOpen()) {
              <div
                class="bg-popover text-popover-foreground border-border absolute top-full right-0 z-30 mt-2 flex min-w-56 flex-col rounded-lg border py-2 text-sm shadow-md"
                (keydown.escape)="consoleMenuOpen.set(false)"
              >
                @for (link of consoleLinks; track link.path) {
                  <a
                    [routerLink]="link.path"
                    routerLinkActive="text-foreground font-medium bg-muted"
                    [routerLinkActiveOptions]="{ exact: link.exact }"
                    class="hover:bg-muted px-5 py-3"
                    (click)="consoleMenuOpen.set(false)"
                  >
                    {{ link.label }}
                  </a>
                }
              </div>
            }
          </div>
        }

        <!-- Same createForm()-based Sentry feedback widget as the global <app-nav> (see
             its own doc comment for why this uses a plain (click) binding rather than
             attachTo()) — the compact pill duplicates it here rather than sharing, since it keeps
             its own nav instead of <app-nav>. -->
        <button
          type="button"
          class="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-full outline-none"
          aria-label="Report a bug"
          title="Report a bug"
          (click)="onReportBug()"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m8 2 1.88 1.88" />
            <path d="M14.12 3.88 16 2" />
            <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
            <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
            <path d="M12 20v-9" />
            <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
            <path d="M6 13H2" />
            <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
            <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
            <path d="M22 13h-4" />
            <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
          </svg>
        </button>
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
              routerLink="/console"
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
    </div>
  `,
})
export class CompactNavComponent {
  private readonly theme = inject(ThemeService);
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
    MODULE_NAV_LINKS.filter((l) => l.path !== this.currentModulePath()),
  );

  /** Below the sm breakpoint, whether the collapsed nav pill's other links are currently shown
   * as a vertical list under the top row. */
  protected readonly navExpanded = signal(false);

  /** Console sub-menu open state — desktop hover dropdown only (mobile renders the sub-links
   * inline in the expanded list without needing a separate open/close state). */
  protected readonly consoleMenuOpen = signal(false);
  private consoleHoverCloseTimeout: ReturnType<typeof setTimeout> | undefined;

  /** Created once, on first use, then reused on every later click — same pattern as
   * AppNavComponent.onReportBug(), see its doc comment for why createForm() over attachTo(). */
  private feedbackDialog: Awaited<
    ReturnType<Exclude<ReturnType<typeof Sentry.getFeedback>, undefined>["createForm"]>
  > | null = null;

  constructor() {
    effect(() => {
      Sentry.getFeedback()?.setTheme(this.theme.resolvedTheme());
    });
  }

  protected async onReportBug(): Promise<void> {
    if (!this.feedbackDialog) {
      this.feedbackDialog = (await Sentry.getFeedback()?.createForm()) ?? null;
    }
    this.feedbackDialog?.appendToDom();
    this.feedbackDialog?.open();
  }

  protected onConsoleMenuEnter(): void {
    clearTimeout(this.consoleHoverCloseTimeout);
    this.consoleMenuOpen.set(true);
  }

  protected onConsoleMenuLeave(): void {
    this.consoleHoverCloseTimeout = setTimeout(() => this.consoleMenuOpen.set(false), 300);
  }
}
