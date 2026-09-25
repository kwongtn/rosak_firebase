import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { RouterLink } from "@angular/router";

/** Optional deep link rendered at the bottom of the panel (e.g. "How this is counted"). */
export interface InfoPopoverLink {
  text: string;
  routerLink: string;
  fragment?: string;
}

/**
 * Grace window between the pointer leaving the host and the panel closing. Moving the cursor from
 * the trigger pill to the panel crosses a few pixels outside the host; without the delay the panel
 * would close before the link inside it could be clicked. Short enough that moving between pills
 * feels immediate — the one-panel-at-a-time registry, not this delay, is what stops overlap.
 */
const HOVER_CLOSE_DELAY_MS = 300;

/**
 * The slice of a popover the exclusivity registry needs: close at once, without stealing focus.
 * Structural so the registry does not depend on the component class.
 */
export interface ExclusivePopoverHandle {
  closeForExclusivity(): void;
}

/**
 * Only one popover panel is open at a time. Opening claims the slot and immediately closes
 * whichever instance held it; closing (or destroying) releases it. Root-provided so the state
 * lives in the injector — per TestBed, per SSR request — rather than in module scope, which the
 * non-isolated test runner and SSR would otherwise share.
 */
@Injectable({ providedIn: "root" })
export class InfoPopoverRegistry {
  private _active: ExclusivePopoverHandle | null = null;

  /** Makes `popover` the one open panel, closing the previous holder if there was one. */
  claim(popover: ExclusivePopoverHandle): void {
    if (this._active === popover) {
      return;
    }
    const previous = this._active;
    this._active = popover;
    previous?.closeForExclusivity();
  }

  /** Frees the slot; a no-op for an instance that no longer holds it. */
  release(popover: ExclusivePopoverHandle): void {
    if (this._active === popover) {
      this._active = null;
    }
  }
}

/**
 * Shared "what does this mean?" popover: an info trigger (the projected content, optionally led by
 * an "i" glyph) plus a non-modal panel holding one precise definition and an optional link to the
 * full method on `/methodology`.
 *
 * Extracted from the home status chip so every non-obvious number uses one implementation of the
 * parts that are easy to get subtly wrong: hover/focus on pointer devices, tap on touch,
 * Escape-to-close with focus return, outside-click close, and an SSR-safe panel id. Deliberately
 * not built on a portal/overlay library — an absolutely-positioned sibling is the established
 * pattern here and keeps server rendering trivial.
 *
 * Hover is tracked on the host, not on the trigger button, so the panel counts as still-hovered
 * (it is a DOM descendant of the host) and the reader can move the cursor onto it. Leaving the host
 * schedules a close after `HOVER_CLOSE_DELAY_MS`; re-entering cancels it, while Escape and an
 * outside click close immediately.
 *
 * Only one panel is open app-wide: every open claims `InfoPopoverRegistry`, which closes the
 * previous holder at once, so moving from pill A to pill B never leaves two panels on screen. The
 * panel's `absolute … z-20` stacking is what keeps A open (and the pills it overlaps closed) while
 * the cursor is over A's panel: hit-testing lands on the panel, so the overlapped pill's host never
 * receives `mouseenter`.
 *
 * `showIcon: false` drops the "i" glyph for consumers whose projected content is already the
 * trigger (the home status chips). `showMethodologyLink: false` drops the link for chips whose
 * metric has no method page section, demoting the panel from a dialog to a plain tooltip.
 *
 * Capability is measured, not guessed: a `(hover: hover) and (pointer: fine)` device gets
 * hover/focus; anything else gets a tap toggle, and "no hover" is the default until the probe
 * runs so touch never inherits desktop-only behaviour.
 */
@Component({
  selector: "app-info-popover",
  imports: [RouterLink],
  host: {
    class: "relative inline-flex",
    // The panel's `popoverExtra` projection slot is rendered inside `@if (_open())`, so on the
    // server a consumer's projected extras have no DOM home; Angular's hydration serializer then
    // throws NG0502 mid-stream and `@angular/ssr` masks it as a 22-byte `Internal server error.`
    // after a 200. Skipping hydration is Angular's documented remedy for content that is not
    // hydration-compatible — the consequence is that this component and its projected content
    // re-render on hydration instead of hydrating (the server markup inside `app-info-popover` is
    // discarded). Functionally identical: a11y and the public API are unchanged.
    ngSkipHydration: "",
    "(mouseenter)": "onHostEnter()",
    "(mouseleave)": "onHostLeave()",
    "(document:click)": "onDocumentClick($event)",
    "(document:keydown.escape)": "onEscape()",
  },
  template: `
    <button
      #trigger
      type="button"
      class="focus-visible:ring-ring/50 inline-flex cursor-help items-center gap-1 rounded-full outline-none focus-visible:ring-3"
      [attr.aria-label]="'What is ' + label() + '?'"
      [attr.aria-expanded]="_open()"
      [attr.aria-controls]="_panelId() || null"
      (focus)="onFocus()"
      (blur)="onBlur($event)"
      (click)="onClick()"
    >
      @if (showIcon()) {
        <span
          class="border-border bg-muted text-muted-foreground flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none font-semibold"
          aria-hidden="true"
          >i</span
        >
      }
      <ng-content />
    </button>
    @if (_open()) {
      <div
        [id]="_panelId()"
        class="bg-popover text-popover-foreground border-border absolute top-full z-20 mt-1.5 min-w-56 max-w-[calc(100vw-2rem)] rounded-lg border p-3 text-left text-xs font-normal whitespace-normal shadow-md"
        [class.left-0]="align() === 'start'"
        [class.right-0]="align() === 'end'"
        [attr.data-testid]="testId()"
        [attr.role]="hasLink() ? 'dialog' : 'tooltip'"
        [attr.aria-label]="label()"
        [attr.tabindex]="hasLink() ? -1 : null"
      >
        <p class="font-semibold">{{ label() }}</p>
        <p class="text-muted-foreground mt-1">{{ content() }}</p>
        <ng-content select="[popoverExtra]" />
        @if (hasLink() && link(); as l) {
          <a
            class="text-primary mt-2 inline-block underline-offset-4 hover:underline"
            [routerLink]="l.routerLink"
            [fragment]="l.fragment"
          >
            {{ l.text }}
          </a>
        }
      </div>
    }
  `,
})
export class InfoPopover {
  /** Accessible name of the info button and heading of the panel, e.g. "Reliability". */
  readonly label = input.required<string>();
  /** Already-rendered definition text — one precise paragraph; longer copy belongs on /methodology. */
  readonly content = input.required<string>();
  /** Optional "read the full method" link, rendered as the last block of the panel. */
  readonly link = input<InfoPopoverLink | null>(null);
  /** Which edge the panel hugs; "end" in right-hand table cells so it cannot spill off-screen. */
  readonly align = input<"start" | "end">("start");
  /** `data-testid` of the panel — consumers needing back-compat pass their own id. */
  readonly testId = input("info-popover-panel");
  /** Whether the "i" glyph leads the trigger; false when the projected content is the trigger. */
  readonly showIcon = input(true);
  /** Whether the panel renders the "How this is counted" link; without it the panel is a tooltip. */
  readonly showMethodologyLink = input(true);

  /** A panel is a dialog only when it actually carries the methodology link. */
  protected readonly hasLink = computed(() => this.showMethodologyLink() && this.link() !== null);

  protected readonly _open = signal(false);
  /** Measured client-side; defaults to "no hover" (tap toggle) until resolved, the safe default. */
  protected readonly _hoverCapable = signal(false);
  /**
   * Starts empty so the server-rendered markup (no id, no `aria-controls`) and the first client
   * render agree; it is filled in `afterNextRender`, which runs after hydration. The panel is only
   * ever rendered after an interaction, so it always has its id by the time it exists.
   */
  protected readonly _panelId = signal("");

  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** True only during the synchronous `focus()` Escape performs while restoring focus, so the
   * restore does not immediately re-open the panel it just closed. */
  private _restoringFocus = false;

  private readonly _host = inject(ElementRef<HTMLElement>);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _registry = inject(InfoPopoverRegistry);
  private readonly _trigger = viewChild<ElementRef<HTMLButtonElement>>("trigger");
  /** Pending delayed close from a host `mouseleave`; null when no close is scheduled. */
  private _closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this._destroyRef.onDestroy(() => {
      this._cancelPendingClose();
      this._registry.release(this);
    });
    if (!this._isBrowser) {
      return;
    }
    afterNextRender(() => {
      this._panelId.set(`info-popover-panel-${nextInfoPopoverId++}`);
      // Some DOM environments (test jsdom) ship no matchMedia — treat that as "no hover".
      if (typeof window.matchMedia === "function") {
        this._hoverCapable.set(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
      }
    });
  }

  protected onHostEnter(): void {
    if (this._hoverCapable()) {
      this._setOpen(true);
    }
  }

  /** Deferred so the pointer can cross the gap between the trigger and the panel; any re-entry,
   * Escape, outside click or destroy cancels the pending close. */
  protected onHostLeave(): void {
    if (!this._hoverCapable()) {
      return;
    }
    this._cancelPendingClose();
    this._closeTimer = setTimeout(() => {
      this._closeTimer = null;
      this._setOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }

  /** Focus/blur only drive the popover where hover does: on touch, focus() fires before click()
   * and would otherwise fight the tap toggle. */
  protected onFocus(): void {
    if (this._hoverCapable() && !this._restoringFocus) {
      this._setOpen(true);
    }
  }

  protected onBlur(event: FocusEvent): void {
    if (!this._hoverCapable()) {
      return;
    }
    // Moving focus into the panel (e.g. onto the link) is not leaving — the reader is using the
    // panel, so it stays open until focus leaves the whole component or they press Escape.
    const next = event.relatedTarget;
    if (next instanceof Node && this._host.nativeElement.contains(next)) {
      return;
    }
    this._setOpen(false);
  }

  protected onClick(): void {
    if (this._hoverCapable()) {
      // The pointer already opened it; a click must not close a panel the cursor still hovers.
      // Opening from closed still matters for keyboard activation after Escape.
      this._setOpen(true);
      return;
    }
    this._setOpen(!this._open());
  }

  protected onDocumentClick(event: Event): void {
    if (!this._open()) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && this._host.nativeElement.contains(target)) {
      return;
    }
    this._setOpen(false);
  }

  protected onEscape(): void {
    this._cancelPendingClose();
    if (!this._open()) {
      return;
    }
    this._setOpen(false);
    this._restoringFocus = true;
    this._trigger()?.nativeElement.focus();
    this._restoringFocus = false;
  }

  /** Called by the registry when another popover opens: close at once, cancel any pending close,
   * and leave focus alone — only Escape returns focus to the trigger. */
  closeForExclusivity(): void {
    this._setOpen(false);
  }

  /** The single open/close funnel: the panel signal and the registry slot always move together,
   * so no path can leave a closed popover holding the slot or an open one unclaimed. */
  private _setOpen(open: boolean): void {
    this._cancelPendingClose();
    if (open) {
      this._registry.claim(this);
    } else {
      this._registry.release(this);
    }
    this._open.set(open);
  }

  private _cancelPendingClose(): void {
    if (this._closeTimer === null) {
      return;
    }
    clearTimeout(this._closeTimer);
    this._closeTimer = null;
  }
}

/** Module-level so every instance gets a stable, unique id without a private helper. */
let nextInfoPopoverId = 0;
