import { Component, computed, input } from "@angular/core";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { LinePulse } from "../data/home.queries";
import { LinePulseCardComponent } from "./line-pulse-card.component";

/** Matches the typical above-the-fold line count, so the first paint doesn't jump. */
const SKELETON_ROWS = 3;

/** Shared by the "Other lines" summary — the same disclosure idiom as the tracker's checklist. */
const SUMMARY_CLASS =
  "bg-card sticky top-0 z-10 flex cursor-pointer items-center justify-between gap-2 py-1 text-sm font-medium";

/**
 * The front page's line list: skeleton rows while the first read settles, a friendly empty
 * state, otherwise one LinePulseCardComponent per line. Active lines lead the list; anything
 * not ACTIVE (testing, partial, disrupted…) folds into a collapsed "Other lines" disclosure at
 * the bottom, so a degraded line never reads as the page's primary signal. Purely
 * presentational — the host owns HomeStore.lines()/isLoading() and passes them in.
 */
@Component({
  selector: "app-line-pulse-list",
  imports: [HlmSkeleton, LinePulseCardComponent],
  template: `
    <div class="flex flex-col gap-3">
      @if (isLoading()) {
        @for (_ of _skeletons; track $index) {
          <div hlmSkeleton data-testid="line-skeleton" class="h-44 w-full"></div>
        }
      } @else if (lines().length === 0) {
        <p
          class="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm"
        >
          No lines yet.
        </p>
      } @else {
        @for (line of _activeLines(); track line.id) {
          <app-line-pulse-card [line]="line" [refreshTick]="refreshTick()" />
        }

        @if (_otherLines().length > 0) {
          <details class="group" data-testid="other-lines">
            <summary data-testid="other-lines-summary" [class]="SUMMARY_CLASS">
              <span class="flex items-center gap-1.5">
                <svg
                  viewBox="0 0 24 24"
                  class="text-muted-foreground size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
                Other lines
                <span
                  class="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-normal tabular-nums"
                >
                  {{ _otherLines().length }}
                </span>
              </span>
            </summary>
            <div class="mt-3 flex flex-col gap-3">
              @for (line of _otherLines(); track line.id) {
                <app-line-pulse-card [line]="line" [refreshTick]="refreshTick()" />
              }
            </div>
          </details>
        }
      }
    </div>
  `,
})
export class LinePulseListComponent {
  readonly lines = input.required<LinePulse[]>();
  readonly isLoading = input(false);
  /** The host's poll beat, forwarded to every card so an open accordion re-reads its data. */
  readonly refreshTick = input(0);

  protected readonly SUMMARY_CLASS = SUMMARY_CLASS;
  protected readonly _skeletons = Array.from({ length: SKELETON_ROWS });

  protected readonly _activeLines = computed(() =>
    this.lines().filter((line) => line.status === "ACTIVE"),
  );
  protected readonly _otherLines = computed(() =>
    this.lines().filter((line) => line.status !== "ACTIVE"),
  );
}
