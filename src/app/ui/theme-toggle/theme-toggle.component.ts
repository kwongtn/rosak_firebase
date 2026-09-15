import { Component, computed, inject } from "@angular/core";
import { ThemeMode, ThemeService } from "../../core/theme/theme.service";
import { NavIconHoverGroupService } from "../../shell/app-nav/nav-icon-hover-group.service";
import { HlmButton } from "../button/button";

const MODE_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/** light → dark → system → light, matching ThemeService.cycle()'s own order. */
const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  light: "dark",
  dark: "system",
  system: "light",
};

/** One expanded width per mode, not a single guess sized to the longest label ("System") — that
 * single-width approach left "Light"/"Dark" (both visibly narrower text) with a noticeable gap
 * after the label and before the box's own edge, which read as unexplained padding rather than
 * unused box width. Each is tight enough for its own label plus the button's real px-2.5 padding,
 * measured live rather than guessed. */
const EXPANDED_WIDTH: Record<ThemeMode, string> = {
  light: "w-20",
  dark: "w-20",
  system: "w-24",
};

@Component({
  selector: "app-theme-toggle",
  imports: [HlmButton],
  template: `
    <!-- [class] is the *only* class source here (no separate static "class" attribute) so
             there's exactly one string for HlmButton's own hlm()/tailwind-merge to reconcile
             against the size/variant-derived classes — each branch below is a complete,
             self-contained class list for that state, never a partial override layered on top
             of another one. Grows in normal flow, same reasoning as the avatar button in
             app-nav.component.ts: this button comes *before* the avatar in the row, so growing
             it pushes the avatar's start position rightward — a real "push away", not an overlay. -->
    <button
      hlmBtn
      type="button"
      variant="ghost"
      [class]="buttonClass()"
      [attr.aria-label]="'Theme: ' + MODE_LABEL[theme.mode()]"
      [title]="
        'Theme: ' + MODE_LABEL[theme.mode()] + ' — click to switch to ' + MODE_LABEL[nextMode()]
      "
      (click)="theme.cycle()"
      (mouseenter)="hoverGroup.onEnter('theme')"
      (mouseleave)="hoverGroup.onLeave('theme')"
    >
      @switch (theme.mode()) {
        @case ("light") {
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            class="size-4 shrink-0"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
            />
          </svg>
        }
        @case ("dark") {
          <svg viewBox="0 0 24 24" fill="currentColor" class="size-4 shrink-0" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </svg>
        }
        @case ("system") {
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-4 shrink-0"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="12" rx="1.5" />
            <path d="M8 20h8M12 16v4" />
          </svg>
        }
      }
      @if (expanded()) {
        <span class="text-sm font-medium whitespace-nowrap">{{ MODE_LABEL[theme.mode()] }}</span>
      }
    </button>
  `,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly hoverGroup = inject(NavIconHoverGroupService);
  protected readonly MODE_LABEL = MODE_LABEL;
  protected readonly nextMode = computed(() => NEXT_MODE[this.theme.mode()]);
  protected readonly expanded = this.hoverGroup.isExpanded("theme");
  protected readonly buttonClass = computed(() =>
    this.expanded()
      ? `h-7 ${EXPANDED_WIDTH[this.theme.mode()]} justify-start gap-1.5 overflow-hidden px-2.5 transition-[width,padding] duration-500`
      : "size-7 justify-center gap-0 overflow-hidden px-0 transition-[width,padding] duration-500",
  );
}
