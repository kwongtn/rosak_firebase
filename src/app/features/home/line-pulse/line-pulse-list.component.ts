import { Component, computed, input } from "@angular/core";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { LinePulse } from "../data/home.queries";
import { lineNeedsAttention, sortLinesBySeverity } from "../data/network-summary.util";
import { LinePulseCardComponent } from "./line-pulse-card.component";

/** Matches the typical above-the-fold line count, so the first paint doesn't jump. */
const SKELETON_ROWS = 3;

/**
 * The front page's line board: skeleton rows while the first read settles, a friendly empty state,
 * otherwise one LinePulseCardComponent per line in a single **worst-first** order.
 *
 * ⚠️ The previous shape led with every ACTIVE line and folded everything else into a collapsed
 * "Other lines" disclosure. That was the right instinct — a degraded line must not read as routine
 * — and the wrong mechanism: hiding the two deadest lines behind a summary the reader has to go and
 * open means the page's own hero, which just said "3 lines need attention", leads with a column of
 * lines that are fine. The fold also inverted the priority it was meant to protect, because a
 * rider scanning for a problem read the healthy majority first and the headline grew every time
 * another line came back normal.
 *
 * So the ordering is the priority, applied to one flat list: everything needing attention
 * (severity-sorted, worst first) and then the healthy lines, under one caption that names the
 * count. The rule and the tiebreak live in the pure `sortLinesBySeverity`
 * (`data/network-summary.util.ts`), and the caption counts with the SAME `lineNeedsAttention`
 * predicate the hero's tiles use — so the hero, the callout and this board cannot disagree about
 * which lines need attention or which is worse.
 *
 * Purely presentational — the host owns `HomeStore.lines()`/`isLoading()` and passes them in.
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
        @if (_attentionCount() > 0) {
          <h2
            class="text-muted-foreground text-sm font-semibold tracking-wide uppercase"
            data-testid="line-board-attention-heading"
          >
            Needs attention · {{ _attentionCount() }}
          </h2>
        }

        @for (line of _orderedLines(); track line.id) {
          <div data-testid="line-board-row">
            <app-line-pulse-card [line]="line" [refreshTick]="refreshTick()" />
          </div>
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

  protected readonly _skeletons = Array.from({ length: SKELETON_ROWS });

  /** Worst first — see the component doc comment for why this replaced the "Other lines" fold. */
  protected readonly _orderedLines = computed(() => sortLinesBySeverity(this.lines()));

  /** The caption's count, from the hero's own predicate so the two can never disagree. */
  protected readonly _attentionCount = computed(
    () => this.lines().filter(lineNeedsAttention).length,
  );
}
