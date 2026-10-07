import { Component, input, output } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { HlmSheet, HlmSheetBody, HlmSheetHeader } from "../../ui/sheet/sheet";
import { type ConsoleLink } from "../nav-config";
import { type NavLink } from "./app-nav.util";

/**
 * `<app-nav>`'s "not enough room for the full link row" menu: the compact "current module ▾"
 * trigger plus the dropdown it opens — a lightweight popover on a hover-capable device, a
 * bottom sheet on touch. Purely presentational: open state, hover capabicapability and the
 * permission gates are owned by `<app-nav>` and passed in; the trigger click / close / tracker
 * preload requests are emitted back.
 *
 * `class="contents"` keeps the host out of the layout box model, so the trigger and its panel
 * behave as the direct flex children of the nav-links row exactly as they did inline.
 */
@Component({
  selector: "app-nav-module-menu",
  imports: [RouterLink, RouterLinkActive, HlmSheet, HlmSheetHeader, HlmSheetBody],
  host: { class: "contents" },
  template: `
    <button
      type="button"
      class="hover:text-foreground flex min-w-0 items-center gap-1 text-lg font-semibold outline-none"
      [class.animate-nav-reveal]="reveal()"
      [attr.aria-expanded]="open()"
      (click)="triggerClick.emit()"
    >
      <!-- The chevron stays shrink-0 (always fully visible — it's the actual "this
                         opens a menu" affordance) while the label is left free to shrink and
                         truncate: on the narrowest phones there may not be room for the logo, the
                         route title, *and* the full module name, and a silently clipped, chevron-
                         less label reads as broken rather than as a working, if tight, dropdown. -->
      <span class="min-w-0 truncate">{{ currentModuleLabel() }}</span>
      <svg
        viewBox="0 0 24 24"
        class="size-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </button>
    @if (hoverCapable()) {
      <!-- A real mouse and enough width to matter: a small dropdown right under the
                         trigger reads as "more options for what's already a compact toolbar", so it
                         stays a lightweight popover rather than taking over the screen. -->
      @if (open()) {
        <div
          class="bg-popover text-popover-foreground border-border absolute top-full right-0 z-30 mt-2 flex min-w-56 flex-col rounded-lg border py-2 text-sm shadow-md"
          (keydown.escape)="openChange.emit(false)"
        >
          @for (link of links(); track link.path) {
            <a
              [routerLink]="link.path"
              routerLinkActive="text-foreground font-medium bg-muted"
              [routerLinkActiveOptions]="{ exact: link.exact }"
              class="hover:bg-muted px-5 py-3"
              (click)="openChange.emit(false)"
              (mouseenter)="link.path === '/tracker' && preloadTracker.emit()"
              (focus)="link.path === '/tracker' && preloadTracker.emit()"
            >
              {{ link.label }}
            </a>
          }
          @if (isLoggedIn()) {
            <a
              routerLink="/profile"
              routerLinkActive="text-foreground font-medium bg-muted"
              class="hover:bg-muted px-5 py-3"
              (click)="openChange.emit(false)"
            >
              Profile
            </a>
          }
          @if (isAdmin()) {
            <a
              routerLink="/console/spotting"
              routerLinkActive="font-medium bg-muted"
              [routerLinkActiveOptions]="{ exact: true }"
              class="text-destructive hover:bg-muted px-5 py-3"
              (click)="openChange.emit(false)"
            >
              Console
            </a>
            @for (link of consoleLinks(); track link.path) {
              <a
                [routerLink]="link.path"
                routerLinkActive="text-foreground font-medium bg-muted"
                [routerLinkActiveOptions]="{ exact: link.exact }"
                class="hover:bg-muted py-2 pl-9 pr-5 text-sm"
                (click)="openChange.emit(false)"
              >
                {{ link.label }}
              </a>
            }
          }
        </div>
      }
    } @else {
      <!-- Touch, so no real hover to trigger a popover from anyway: a small dropdown
                         pinned to the trigger would either sit under a fingertip or need a second
                         tap to see past it, whereas a sheet is the standard mobile pattern for "pick
                         one of these" and leaves room to actually read the options. -->
      <hlm-sheet [open]="open()" (openChange)="openChange.emit($event)" side="bottom">
        <div hlmSheetHeader class="flex items-center justify-between gap-2">
          <h2 class="text-base font-semibold">Go to</h2>
          <button
            type="button"
            class="text-muted-foreground hover:bg-muted hover:text-foreground -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full outline-none"
            aria-label="Close"
            title="Close"
            (click)="openChange.emit(false)"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div hlmSheetBody>
          <div class="flex flex-col gap-1 text-sm">
            @for (link of links(); track link.path) {
              <a
                [routerLink]="link.path"
                routerLinkActive="text-foreground font-medium bg-muted"
                [routerLinkActiveOptions]="{ exact: link.exact }"
                class="hover:bg-muted rounded-lg px-3 py-2"
                (click)="openChange.emit(false)"
                (mouseenter)="link.path === '/tracker' && preloadTracker.emit()"
                (focus)="link.path === '/tracker' && preloadTracker.emit()"
              >
                {{ link.label }}
              </a>
            }
            @if (isLoggedIn()) {
              <a
                routerLink="/profile"
                routerLinkActive="text-foreground font-medium bg-muted"
                class="hover:bg-muted rounded-lg px-3 py-2"
                (click)="openChange.emit(false)"
              >
                Profile
              </a>
            }
            @if (isAdmin()) {
              <a
                routerLink="/console/spotting"
                routerLinkActive="font-medium bg-muted"
                [routerLinkActiveOptions]="{ exact: true }"
                class="text-destructive hover:bg-muted rounded-lg px-3 py-2"
                (click)="openChange.emit(false)"
              >
                Console
              </a>
              <div class="text-muted-foreground flex flex-col gap-1 pl-4 text-sm font-medium">
                @for (link of consoleLinks(); track link.path) {
                  <a
                    [routerLink]="link.path"
                    routerLinkActive="text-foreground font-medium bg-muted"
                    [routerLinkActiveOptions]="{ exact: link.exact }"
                    class="hover:bg-muted rounded-lg px-3 py-2 text-sm font-normal"
                    (click)="openChange.emit(false)"
                  >
                    {{ link.label }}
                  </a>
                }
              </div>
            }
          </div>
        </div>
      </hlm-sheet>
    }
  `,
})
export class AppNavModuleMenuComponent {
  readonly open = input.required<boolean>();
  readonly hoverCapable = input.required<boolean>();
  readonly links = input.required<NavLink[]>();
  readonly consoleLinks = input.required<ConsoleLink[]>();
  readonly isLoggedIn = input.required<boolean>();
  readonly isAdmin = input.required<boolean>();
  /** Whether the nav-link row's one-shot reveal animation should play on this render. */
  readonly reveal = input.required<boolean>();
  /** The collapsed trigger's own label (the current module's name). */
  readonly currentModuleLabel = input.required<string>();

  readonly triggerClick = output<void>();
  readonly openChange = output<boolean>();
  readonly preloadTracker = output<void>();
}
