import { CdkTrapFocus } from "@angular/cdk/a11y";
import { DatePipe } from "@angular/common";
import { Component, OnDestroy, computed, input, output } from "@angular/core";
import { injectIsBrowser } from "../../../core/composables/is-browser";
import { MediaNode } from "../data/gallery.queries";
import { mediaLabel } from "../data/media-label.util";

/** A swipe has to travel at least this far sideways, and further sideways than up or down: a tap,
 * or a vertical scroll that wobbles, must not flip the photo. */
const SWIPE_MIN_PX = 50;

/**
 * Full-screen photo viewer opened from the justified grid — the old app just opened the raw
 * image URL in a new tab; this instead shows the real image alongside whatever metadata the
 * backend actually has for it (uploader, upload date), matching the read-only "Details" panel
 * pattern already familiar from ng-zorro's own image preview, without pulling in a whole image
 * library for what's otherwise a plain overlay.
 *
 * It is a modal dialog (`role="dialog"`, `aria-modal`). `cdkTrapFocus` with auto-capture moves
 * focus to the first tabbable element (the Close button) when it opens, keeps Tab inside it, and
 * hands focus back to whatever had it before (the thumbnail that opened it) when it is destroyed.
 *
 * The host owns the list: it passes the photos either side of `media` as `prev` / `next` (null at
 * either end, or when it has no list, as the incident card does) and moves on when `navigate`
 * emits one of them. ArrowLeft / ArrowRight, a touch swipe and the two buttons all end there. The
 * buttons stay in the DOM, `aria-disabled`, at either end: a disabled button that has focus
 * drops it, and that would let focus out of the trap.
 */
@Component({
  selector: "app-media-viewer",
  imports: [CdkTrapFocus, DatePipe],
  host: {
    class: "fixed inset-0 z-50 flex flex-col bg-black/90",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Photo viewer",
    "(click)": "close.emit()",
    "(document:keydown.escape)": "onEscape()",
    // Angular matches these only without a modifier, so Alt+Left (browser Back) is left alone.
    "(document:keydown.arrowleft)": "step(prev())",
    "(document:keydown.arrowright)": "step(next())",
  },
  template: `
    <div cdkTrapFocus [cdkTrapFocusAutoCapture]="true" class="flex min-h-0 flex-1 flex-col">
      <div class="flex items-center justify-end p-3">
        <button
          type="button"
          class="text-white/80 hover:text-white inline-flex size-9 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          aria-label="Close"
          (click)="close.emit()"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div
        class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden"
        (click)="$event.stopPropagation()"
      >
        <!-- touch-pan-y: the browser keeps vertical scrolling and pinch zoom and leaves sideways
             drags to the swipe handlers (it would otherwise cancel the pointer mid-swipe). -->
        <div
          class="relative flex flex-1 touch-pan-y touch-pinch-zoom items-center justify-center p-3 lg:min-h-0"
          data-testid="media-viewer-stage"
          (pointerdown)="onPointerDown($event)"
          (pointerup)="onPointerUp($event)"
          (pointercancel)="onPointerCancel()"
        >
          <img
            [src]="media().file?.url ?? '/image-not-found.png'"
            [alt]="label()"
            class="max-h-[70vh] max-w-full rounded-lg object-contain lg:max-h-full"
          />
          @if (prev() || next()) {
            <button
              type="button"
              class="absolute top-1/2 left-3 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white outline-none hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white/50 aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:bg-black/50"
              aria-label="Previous photo"
              data-testid="media-viewer-prev"
              [attr.aria-disabled]="!prev()"
              (click)="step(prev())"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              class="absolute top-1/2 right-3 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white outline-none hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white/50 aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:bg-black/50"
              aria-label="Next photo"
              data-testid="media-viewer-next"
              [attr.aria-disabled]="!next()"
              (click)="step(next())"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          }
        </div>

        <div
          class="flex w-full flex-col gap-4 p-4 text-white lg:w-72 lg:shrink-0 lg:overflow-y-auto"
        >
          <h3 class="text-xs font-semibold tracking-wide text-white/50 uppercase">Details</h3>
          @if (media().uploader?.nickname) {
            <div>
              <p class="text-xs text-white/50">Uploaded by</p>
              <p class="text-sm">{{ media().uploader?.nickname }}</p>
            </div>
          }
          <div>
            <p class="text-xs text-white/50">Uploaded on</p>
            <p class="text-sm">{{ media().createdDate | date: "mediumDate" }}</p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MediaViewerComponent implements OnDestroy {
  readonly media = input.required<MediaNode>();
  /** The photos either side of `media` in the host's list; null at an end, or with no list. */
  readonly prev = input<MediaNode | null>(null);
  readonly next = input<MediaNode | null>(null);
  readonly close = output<void>();
  /** The photo the visitor asked for: always the current `prev` or `next`. */
  readonly navigate = output<MediaNode>();

  private readonly isBrowser = injectIsBrowser();
  protected readonly label = computed(() => mediaLabel(this.media()));
  private swipeStart: { x: number; y: number } | null = null;

  constructor() {
    if (this.isBrowser) {
      document.body.style.overflow = "hidden";
    }
  }

  protected onEscape(): void {
    this.close.emit();
  }

  /** Does nothing at an end of the list, where there is no photo to go to. */
  protected step(target: MediaNode | null): void {
    if (target) {
      this.navigate.emit(target);
    }
  }

  // Touch and pen only: a mouse has the buttons and the arrow keys, and a mouse drag would fight
  // text selection and the browser's own image drag. Only a lone primary pointer can swipe, so a
  // second finger (a pinch) calls it off.
  protected onPointerDown(event: PointerEvent): void {
    this.swipeStart =
      event.isPrimary && event.pointerType !== "mouse"
        ? { x: event.clientX, y: event.clientY }
        : null;
  }

  protected onPointerUp(event: PointerEvent): void {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start || !event.isPrimary) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
      // Dragging left pulls the next photo in from the right.
      this.step(dx < 0 ? this.next() : this.prev());
    }
  }

  protected onPointerCancel(): void {
    this.swipeStart = null;
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      document.body.style.overflow = "";
    }
  }
}
