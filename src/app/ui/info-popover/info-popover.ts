import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
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
 * Shared "what does this mean?" popover: a real info button plus a non-modal panel holding one
 * precise definition and an optional link to the full method on `/methodology`.
 *
 * Extracted from the home status chip so every non-obvious number uses one implementation of the
 * parts that are easy to get subtly wrong: hover/focus on pointer devices, tap on touch,
 * Escape-to-close with focus return, outside-click close, and an SSR-safe panel id. Deliberately
 * not built on a portal/overlay library — an absolutely-positioned sibling is the established
 * pattern here and keeps server rendering trivial.
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
      (mouseenter)="onMouseEnter()"
      (mouseleave)="onMouseLeave()"
      (focus)="onFocus()"
      (blur)="onBlur($event)"
      (click)="onClick()"
    >
      <span
        class="border-border bg-muted text-muted-foreground flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none font-semibold"
        aria-hidden="true"
        >i</span
      >
      <ng-content />
    </button>
    @if (_open()) {
      <div
        [id]="_panelId()"
        class="bg-popover text-popover-foreground border-border absolute top-full z-20 mt-1.5 min-w-56 max-w-[calc(100vw-2rem)] rounded-lg border p-3 text-left text-xs font-normal whitespace-normal shadow-md"
        [class.left-0]="align() === 'start'"
        [class.right-0]="align() === 'end'"
        [attr.data-testid]="testId()"
        [attr.role]="link() ? 'dialog' : 'tooltip'"
        [attr.aria-label]="label()"
        [attr.tabindex]="link() ? -1 : null"
      >
        <p class="font-semibold">{{ label() }}</p>
        <p class="text-muted-foreground mt-1">{{ content() }}</p>
        <ng-content select="[popoverExtra]" />
        @if (link(); as l) {
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
  private readonly _trigger = viewChild<ElementRef<HTMLButtonElement>>("trigger");

  constructor() {
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

  protected onMouseEnter(): void {
    if (this._hoverCapable()) {
      this._open.set(true);
    }
  }

  protected onMouseLeave(): void {
    if (this._hoverCapable()) {
      this._open.set(false);
    }
  }

  /** Focus/blur only drive the popover where hover does: on touch, focus() fires before click()
   * and would otherwise fight the tap toggle. */
  protected onFocus(): void {
    if (this._hoverCapable() && !this._restoringFocus) {
      this._open.set(true);
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
    this._open.set(false);
  }

  protected onClick(): void {
    if (this._hoverCapable()) {
      // The pointer already opened it; a click must not close a panel the cursor still hovers.
      // Opening from closed still matters for keyboard activation after Escape.
      this._open.set(true);
      return;
    }
    this._open.update((open) => !open);
  }

  protected onDocumentClick(event: Event): void {
    if (!this._open()) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && this._host.nativeElement.contains(target)) {
      return;
    }
    this._open.set(false);
  }

  protected onEscape(): void {
    if (!this._open()) {
      return;
    }
    this._open.set(false);
    this._restoringFocus = true;
    this._trigger()?.nativeElement.focus();
    this._restoringFocus = false;
  }
}

/** Module-level so every instance gets a stable, unique id without a private helper. */
let nextInfoPopoverId = 0;
