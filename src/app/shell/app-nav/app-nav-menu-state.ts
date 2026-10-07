import { signal } from "@angular/core";

/** How long a hover-close waits before actually collapsing the menu — long enough that moving
 * the mouse from the trigger down into the panel (briefly leaving both) doesn't read as "left". */
export const HOVER_CLOSE_DELAY_MS = 300;

/**
 * Open/close state for `<app-nav>`'s two hover menus, kept out of the component so the rendering
 * concern and the menu-state concern stay separate.
 *
 * Both menus only auto-open on a `(hover: hover) and (pointer: fine)` device: a hover-incapable
 * device gets a tap-to-toggle trigger with no hover-close timer to fight (see `hoverCapable`,
 * fed by the component's measured `matchMedia` check). `moduleMenuOpen` is the collapsed
 * trigger's dropdown/sheet; `consoleMenuOpen` is the Console item's own hover dropdown in the
 * expanded inline link list — a separate signal because the two never render together.
 */
export class NavMenuState {
  readonly moduleMenuOpen = signal(false);
  readonly consoleMenuOpen = signal(false);
  readonly hoverCapable = signal(false);

  private hoverCloseTimeout: ReturnType<typeof setTimeout> | undefined;
  private consoleHoverCloseTimeout: ReturnType<typeof setTimeout> | undefined;

  onModuleMenuEnter(): void {
    if (!this.hoverCapable()) {
      return;
    }
    clearTimeout(this.hoverCloseTimeout);
    this.moduleMenuOpen.set(true);
  }

  onModuleMenuLeave(): void {
    if (!this.hoverCapable()) {
      return;
    }
    this.hoverCloseTimeout = setTimeout(() => this.moduleMenuOpen.set(false), HOVER_CLOSE_DELAY_MS);
  }

  onModuleMenuTriggerClick(): void {
    clearTimeout(this.hoverCloseTimeout);
    if (this.hoverCapable()) {
      // On a hover-capable device, a click here is almost always the tail end of the same
      // mouse movement that just hover-opened the menu via onModuleMenuEnter — toggling would
      // immediately close what hovering just opened. Click only needs to *ensure* it's open
      // (this is also how keyboard activation reaches it); closing stays mouseleave/Escape's job,
      // same as it already is for the hover-open path.
      this.moduleMenuOpen.set(true);
      return;
    }
    this.moduleMenuOpen.set(!this.moduleMenuOpen());
  }

  onConsoleMenuEnter(): void {
    if (!this.hoverCapable()) {
      return;
    }
    clearTimeout(this.consoleHoverCloseTimeout);
    this.consoleMenuOpen.set(true);
  }

  onConsoleMenuLeave(): void {
    if (!this.hoverCapable()) {
      return;
    }
    this.consoleHoverCloseTimeout = setTimeout(
      () => this.consoleMenuOpen.set(false),
      HOVER_CLOSE_DELAY_MS,
    );
  }
}
