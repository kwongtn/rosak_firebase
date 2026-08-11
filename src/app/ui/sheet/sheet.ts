import { A11yModule } from "@angular/cdk/a11y";
import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  HostListener,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  model,
  signal,
} from "@angular/core";

/**
 * A slide-in panel, replacing ng-zorro's nz-drawer. Deliberately built directly on CDK's
 * focus-trap primitive rather than spartan-ng's Brain dialog/sheet: Brain's dialog machinery
 * is a deep, portal-based abstraction (see @spartan-ng/brain/dialog) that's overkill for the
 * one sheet this app needs right now — this covers the same real requirements (focus trap,
 * Escape-to-close, backdrop-click-to-close) with far less to get subtly wrong by hand.
 *
 * The backdrop/panel are only ever added to the DOM once `open()` has been true at least once
 * (see `_everOpened`) — not rendered-but-hidden from the moment the host mounts. A parent shell
 * like SpottingShellPage keeps this component alive for the whole /spotting session, so without
 * this guard, the panel would be created while `open()` is still `false` on every fresh mount
 * (e.g. navigating in from another top-level route); Angular applies the `[class]` binding a
 * tick after the element is first inserted, so there's a brief window where a freshly-created
 * panel has no transform class yet — visually "open" — before the closed class lands, and
 * because `transform` is transitioned, the browser animates that as a slide-out. Not rendering
 * the panel until it's actually opened removes the untransformed frame entirely.
 */
@Component({
  selector: "hlm-sheet",
  imports: [A11yModule],
  host: {
    "[class.pointer-events-none]": "!open()",
  },
  template: `
    @if (_everOpened()) {
      <div
        class="bg-black/50 fixed inset-0 z-40 transition-opacity"
        [class.opacity-0]="!open()"
        [class.opacity-100]="open()"
        (click)="close()"
      ></div>
      <div
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="open()"
        class="bg-popover text-popover-foreground fixed z-50 flex flex-col shadow-lg transition-transform"
        [class]="_panelClass()"
      >
        <ng-content />
      </div>
    }
  `,
})
export class HlmSheet implements OnDestroy {
  readonly open = model(false);
  readonly side = model<"right" | "bottom" | "full">("right");

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly _everOpened = signal(false);

  protected readonly _panelClass = computed(() => {
    if (this.side() === "bottom") {
      return `inset-x-0 bottom-0 max-h-[90vh] rounded-t-xl border-t ${this.open() ? "translate-y-0" : "translate-y-full"}`;
    }
    if (this.side() === "full") {
      // Centered near-fullscreen modal rather than a slide-in edge panel. Unlike "bottom"/
      // "right", this one doesn't translate off-screen when closed (there's no edge for a
      // *centered* panel to slide behind) — confirmed live as a real bug from relying on
      // `scale-95` alone for the closed state: a 5% shrink is nowhere near enough to read as
      // "gone", so the modal appeared permanently stuck open even though `open()` had
      // correctly gone false and the click was registering. `invisible` (not `hidden`,
      // which Angular's own `@if (_everOpened())` above already governs) makes the closed
      // state definitively non-interactive and unseen rather than just slightly smaller.
      return `inset-4 sm:inset-10 max-h-none overflow-hidden rounded-xl border ${this.open() ? "scale-100 opacity-100" : "invisible scale-95 opacity-0"}`;
    }
    // Full-bleed on small screens (no width cap, no border) — a real side panel only once
    // there's enough width for it to look like one rather than just a squeezed page.
    return `inset-y-0 right-0 h-full w-full sm:max-w-lg sm:border-l ${this.open() ? "translate-x-0" : "translate-x-full"}`;
  });

  constructor() {
    // The backdrop is a fixed overlay, but that alone doesn't stop wheel/touch scroll
    // gestures over it from reaching and scrolling the page underneath — lock it explicitly
    // for as long as the sheet is open.
    effect(() => {
      const isOpen = this.open();
      if (isOpen) {
        this._everOpened.set(true);
      }
      if (!this.isBrowser) {
        return;
      }
      document.body.style.overflow = isOpen ? "hidden" : "";
    });
  }

  @HostListener("document:keydown.escape")
  protected onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  close(): void {
    this.open.set(false);
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      document.body.style.overflow = "";
    }
  }
}

@Component({
  selector: "[hlmSheetHeader]",
  template: "<ng-content />",
  host: { class: "border-b p-5" },
})
export class HlmSheetHeader {}

@Component({
  selector: "[hlmSheetBody]",
  template: "<ng-content />",
  host: { class: "flex-1 overflow-y-auto overscroll-contain p-5" },
})
export class HlmSheetBody {}

@Component({
  selector: "[hlmSheetFooter]",
  template: "<ng-content />",
  host: { class: "flex items-center justify-between gap-2 border-t p-5" },
})
export class HlmSheetFooter {}
