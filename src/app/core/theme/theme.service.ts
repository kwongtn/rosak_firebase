import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";
const MODES: ThemeMode[] = ["light", "dark", "system"];

/**
 * Signals-based light/dark/system theme, toggled by adding/removing `.dark` on <html> — see the
 * `@custom-variant dark` declaration in styles.css that makes Tailwind's `dark:` utilities and
 * the `:root.dark` CSS variables both key off that class.
 *
 * `mode` is the user-facing tri-state (what the toggle button cycles through and persists);
 * `resolvedTheme` is the actual light/dark that gets painted — the two only differ while
 * `mode() === "system"`, in which case `resolvedTheme` tracks the OS preference live via a
 * `matchMedia` change listener rather than resolving it once at startup, so flipping the OS theme
 * while "system" is selected updates the app immediately instead of only on next load.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly mode = signal<ThemeMode>("system");
  private readonly systemPrefersDark = signal(false);

  readonly resolvedTheme = computed<ResolvedTheme>(() => {
    const mode = this.mode();
    return mode === "system" ? (this.systemPrefersDark() ? "dark" : "light") : mode;
  });

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      this.mode.set(stored);
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    this.systemPrefersDark.set(media.matches);
    media.addEventListener("change", (event) => this.systemPrefersDark.set(event.matches));

    effect(() => {
      document.documentElement.classList.toggle("dark", this.resolvedTheme() === "dark");
    });
  }

  /** Advances light → dark → system → light. A 3-way cycle rather than a menu, matching the
   * single-button toggle affordance this replaces. */
  cycle(): void {
    const next = MODES[(MODES.indexOf(this.mode()) + 1) % MODES.length];
    this.mode.set(next);
    if (this.isBrowser) {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }
}
