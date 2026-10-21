import { CdkTrapFocus } from "@angular/cdk/a11y";
import { DatePipe } from "@angular/common";
import { Component, OnDestroy, computed, inject, input, output } from "@angular/core";
import { injectIsBrowser } from "../../../core/composables/is-browser";
import { MediaNode } from "../data/gallery.queries";
import { mediaLabel } from "../data/media-label.util";

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
        <div class="flex flex-1 items-center justify-center p-3 lg:min-h-0">
          <img
            [src]="media().file?.url ?? '/image-not-found.png'"
            [alt]="label()"
            class="max-h-[70vh] max-w-full rounded-lg object-contain lg:max-h-full"
          />
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
  readonly close = output<void>();

  private readonly isBrowser = injectIsBrowser();
  protected readonly label = computed(() => mediaLabel(this.media()));

  constructor() {
    if (this.isBrowser) {
      document.body.style.overflow = "hidden";
    }
  }

  protected onEscape(): void {
    this.close.emit();
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      document.body.style.overflow = "";
    }
  }
}
