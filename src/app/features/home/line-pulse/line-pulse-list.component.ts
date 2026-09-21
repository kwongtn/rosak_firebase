import { Component, input } from "@angular/core";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { LinePulse } from "../data/home.queries";
import { LinePulseCardComponent } from "./line-pulse-card.component";

/** Matches the typical above-the-fold line count, so the first paint doesn't jump. */
const SKELETON_ROWS = 3;

/**
 * The front page's line list: skeleton rows while the first read settles, a friendly empty
 * state, otherwise one LinePulseCardComponent per line. Purely presentational — the host owns
 * HomeStore.lines()/isLoading() and passes them in.
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
        @for (line of lines(); track line.id) {
          <app-line-pulse-card [line]="line" />
        }
      }
    </div>
  `,
})
export class LinePulseListComponent {
  readonly lines = input.required<LinePulse[]>();
  readonly isLoading = input(false);

  protected readonly _skeletons = Array.from({ length: SKELETON_ROWS });
}
