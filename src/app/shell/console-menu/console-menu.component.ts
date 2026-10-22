import { booleanAttribute, Component, DestroyRef, inject, input, signal } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { HOVER_CLOSE_DELAY_MS } from "../app-nav/app-nav-menu-state";
import { CONSOLE_LINKS } from "../nav-config";

/**
 * The admin-only "Console" link with its hover dropdown of console sub-sections
 * (`CONSOLE_LINKS`), shared by `<app-nav>`'s inline link row and `<app-compact-nav>`'s desktop
 * row. The host is the wrapper `<div>` (attribute selector), so the consumer's own classes
 * (`hidden sm:block` on the compact pill) land on the same element. The caller renders it only for
 * admins. Owns its open state and the hover-close timer: the dropdown opens on pointer enter and
 * closes after `HOVER_CLOSE_DELAY_MS`, so moving the mouse from the link down into the panel
 * doesn't read as "left".
 */
@Component({
  selector: "div[app-console-menu]",
  imports: [RouterLink, RouterLinkActive],
  host: {
    class: "relative shrink-0",
    "(mouseenter)": "onEnter()",
    "(mouseleave)": "onLeave()",
  },
  template: `
    <a
      routerLink="/console/spotting"
      routerLinkActive="font-medium"
      [routerLinkActiveOptions]="{ exact: true }"
      class="text-destructive hover:text-destructive/80 flex items-center gap-1 whitespace-nowrap"
    >
      Console
      @if (showChevron()) {
        <svg
          viewBox="0 0 24 24"
          class="size-3 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      }
    </a>
    @if (open()) {
      <div
        class="bg-popover text-popover-foreground border-border absolute top-full right-0 z-30 mt-2 flex min-w-56 flex-col rounded-lg border py-2 text-sm shadow-md"
        (keydown.escape)="open.set(false)"
      >
        @for (link of links; track link.path) {
          <a
            [routerLink]="link.path"
            routerLinkActive="text-foreground font-medium bg-muted"
            [routerLinkActiveOptions]="{ exact: link.exact }"
            class="hover:bg-muted px-5 py-3"
            (click)="open.set(false)"
          >
            {{ link.label }}
          </a>
        }
      </div>
    }
  `,
})
export class ConsoleMenuComponent {
  /** Whether the device has a real hover (`(hover: hover) and (pointer: fine)`). A touch device
   * gets no hover dropdown: a tap just follows the Console link. Defaults to `true` for hosts
   * that never measure it. */
  readonly hoverCapable = input(true);
  /** Draws the small "opens a menu" chevron after the label. */
  readonly showChevron = input(false, { transform: booleanAttribute });

  protected readonly links = CONSOLE_LINKS;
  protected readonly open = signal(false);
  private closeTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.closeTimeout));
  }

  protected onEnter(): void {
    if (!this.hoverCapable()) {
      return;
    }
    clearTimeout(this.closeTimeout);
    this.open.set(true);
  }

  protected onLeave(): void {
    if (!this.hoverCapable()) {
      return;
    }
    this.closeTimeout = setTimeout(() => this.open.set(false), HOVER_CLOSE_DELAY_MS);
  }
}
