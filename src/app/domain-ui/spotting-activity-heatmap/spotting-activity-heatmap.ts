import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  computed,
  signal,
  input,
  afterNextRender,
  ElementRef,
  viewChild,
  DestroyRef,
  inject,
} from "@angular/core";
import { SpottingType } from "../../core/graphql/types";
import { SpottingCountTooltipComponent } from "./spotting-count-tooltip.component";

export interface SpottingActivityPoint {
  dateKey: string;
  count: number;
  eventType: SpottingType;
}

interface TypeCount {
  type: SpottingType;
  count: number;
}

interface DayCell {
  date: string;
  count: number;
  inYear: boolean;
  breakdown: TypeCount[];
}

interface WeekColumn {
  days: DayCell[];
}

/** Pure Y-M-D calendar key, built entirely off UTC getters/setters so day-boundary arithmetic
 * never drifts with the viewer's local timezone — `dateKey` from the backend is a calendar date,
 * not an instant, so this treats `Date` purely as a calendar-math tool, never as a real moment. */
export function dateKeyOf(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Buckets a vehicle's (or user's) raw spottings into one point per (day, type) — shared by
 * every place that feeds a `spotting-activity-heatmap`, so the "same day, same type, multiple
 * spottings" collapsing logic lives in exactly one place. */
export function toSpottingActivityPoints(
  spottings: ReadonlyArray<{ spottingDate: string; type: SpottingType }>,
): SpottingActivityPoint[] {
  const counts = new Map<string, number>();
  for (const s of spottings) {
    const key = `${s.spottingDate} ${s.type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => {
    const [dateKey, eventType] = key.split(" ") as [string, SpottingType];
    return { dateKey, eventType, count };
  });
}

/** Shared banding between this heatmap's own day cells and any other grid that wants the same
 * "darker for busier" scale against a known maximum (e.g. the line-details page's vehicle ×
 * date grid) — one set of thresholds, so the two don't visually disagree about what "busy"
 * looks like. */
export function spottingIntensityClass(count: number, maxCount: number): string {
  if (count === 0) {
    return "bg-muted";
  }
  const ratio = count / Math.max(1, maxCount);
  if (ratio > 0.75) return "bg-primary";
  if (ratio > 0.5) return "bg-primary/70";
  if (ratio > 0.25) return "bg-primary/45";
  return "bg-primary/25";
}

/** Rough footprint of the year-pills column (pill width + the gap beside it) when it sits next
 * to the grid rather than above it, plus a little slack — doesn't need to be exact, just close
 * enough to decide "is there real room to spare" a bit conservatively. */
const YEARS_COLUMN_ESTIMATE_PX = 90;

/**
 * A GitHub/GitLab-style contribution heatmap — one tile per day, darker for busier days, with a
 * year selector and a per-day type breakdown on hover. Shared between the profile page (a user's
 * own spottings) and the vehicle-detail page (one vehicle's spotting history) — both just need to
 * shape their data into `SpottingActivityPoint[]` and supply their own all-time total for the
 * caption's percentage.
 *
 * Which of two layouts renders is decided by *measuring* this component's own width (a
 * ResizeObserver, not a viewport breakpoint) against how much a full year of weeks-as-columns
 * actually needs at a legible size:
 *  - Wide enough: the classic layout — weeks as columns, years in a column beside the grid.
 *  - Not wide enough (typically mobile, but also a desktop window/card that's just narrow): a
 *    compact fallback — years move above the grid, and *all* the year's days are laid out as one
 *    flat, chronological sequence in a CSS grid with `auto-fill` columns, which reads left-to-
 *    right/top-to-bottom (grid's own default placement order) and sizes its own column count to
 *    whatever fits, rather than a fixed-size grid that would need to scroll or one that would
 *    read top-to-bottom/left-to-right (stacking each week as a column instead).
 *
 * Both layouts are built so they can never need to scroll horizontally: the classic layout only
 * ever renders once measurement confirms its own minimum fits, and the compact one's `auto-fill`
 * always sizes itself to whatever width it's actually given.
 */
@Component({
  selector: "spotting-activity-heatmap",
  imports: [SpottingCountTooltipComponent, NgTemplateOutlet],
  template: `
    <div #container class="flex flex-col gap-3">
      <div
        class="flex flex-col gap-3"
        [class.flex-row]="useClassicLayout()"
        [class.items-start]="useClassicLayout()"
      >
        @if (!hideYearPicker()) {
          <div
            class="flex flex-wrap gap-1.5"
            [class.flex-col]="useClassicLayout()"
            [class.order-last]="useClassicLayout()"
          >
            @for (year of years(); track year) {
              <button
                type="button"
                class="rounded-full border px-2.5 py-1 text-xs transition-colors"
                [class]="
                  year === selectedYear()
                    ? 'bg-primary text-primary-foreground border-transparent'
                    : 'border-border hover:bg-muted'
                "
                (click)="selectedYear.set(year)"
              >
                {{ year }}
              </button>
            }
          </div>
        }

        <div class="min-w-0 flex-1">
          @if (useClassicLayout()) {
            <div class="grid gap-1" [style.grid-template-columns]="gridTemplateColumns()">
              @for (week of weeks(); track $index) {
                <div class="flex flex-col gap-1">
                  @for (day of week.days; track day.date) {
                    <ng-container *ngTemplateOutlet="cellTpl; context: { $implicit: day }" />
                  }
                </div>
              }
            </div>
          } @else {
            <div
              class="grid gap-1"
              style="grid-template-columns: repeat(auto-fill, minmax(18px, 1fr));"
            >
              @for (day of flatDays(); track day.date) {
                <ng-container *ngTemplateOutlet="cellTpl; context: { $implicit: day }" />
              }
            </div>
          }
        </div>
      </div>

      <p class="text-muted-foreground text-sm">{{ funCaption() }}</p>
    </div>

    <ng-template #cellTpl let-day>
      <div
        class="relative"
        (mouseenter)="onHoverStart(day, $event)"
        (mouseleave)="hoveredDate.set(null)"
      >
        <div
          tabindex="0"
          class="aspect-square rounded-sm outline-none"
          [class]="day.inYear ? cellClass(day.count) : 'bg-transparent'"
          (focus)="onHoverStart(day, $event)"
          (blur)="hoveredDate.set(null)"
        ></div>
        @if (day.inYear && day.date === todayKey) {
          <!-- A ring overlay, not "animate-pulse" on the cell itself: that fades the
                         cell's own opacity, which would also fade out its activity-level color —
                         this only needs the "today" outline to breathe, not the fill it's ringing. -->
          <span
            class="ring-foreground/80 pointer-events-none absolute inset-0 animate-pulse rounded-sm ring-2"
            aria-hidden="true"
          ></span>
        }
        @if (day.inYear && hoveredDate() === day.date) {
          <app-spotting-count-tooltip
            [dateKey]="day.date"
            [count]="day.count"
            [breakdown]="day.breakdown"
            [above]="tooltipAbove()"
          />
        }
      </div>
    </ng-template>
  `,
})
export class SpottingActivityHeatmap {
  readonly data = input.required<SpottingActivityPoint[]>();
  /** Hides the year-selector row, always rendering `selectedYear`'s (defaults to the current
   * year, and nothing else can change it once this is on) grid alone — for small, transient
   * contexts like a hover preview, where a multi-year switcher would be both cramped and
   * effectively unreachable (it'd disappear the moment the pointer left to click a year). */
  readonly hideYearPicker = input(false);
  /** All-time total, for the caption's "% of everything" — deliberately a separate input
   * rather than summed from `data()`: for a user that's their all-time spottingsCount, for a
   * vehicle its all-time spottingCount, and either can legitimately cover more history than
   * whatever range `data()` happens to carry. */
  readonly totalAllTime = input.required<number>();

  protected readonly selectedYear = signal(new Date().getFullYear());
  /** Which day's breakdown popup is showing, if any. Deliberately JS-driven rather than a pure
   * CSS `group-hover`: that kept every hovered-able tooltip element permanently in the DOM
   * (just visually hidden via `invisible`), and an absolutely-positioned descendant still counts
   * toward its scrollable ancestor's `scrollWidth`/`scrollHeight` even while invisible. Gating
   * each tooltip's existence on this signal means at most one ever exists at a time, and only
   * while actually shown. */
  protected readonly hoveredDate = signal<string | null>(null);
  /** Whether the currently-open tooltip pops above or below its cell — computed per-hover from
   * actual measured space (see `onHoverStart`) rather than a fixed row-index rule, since which
   * side has more room depends on which layout is active and where the cell actually lands. */
  protected readonly tooltipAbove = signal(true);
  /** Computed once (not a signal/computed): "today" doesn't need to react to anything for the
   * lifetime of one rendered page — the extreme edge of the page staying open across a real
   * midnight rollover isn't worth a ticking timer for. */
  protected readonly todayKey = dateKeyOf(new Date());

  private readonly destroyRef = inject(DestroyRef);
  private readonly container = viewChild.required<ElementRef<HTMLElement>>("container");
  /** Defaults to 0 (→ the compact layout) rather than measuring `true` first: expanding into
   * the classic layout once measured is unremarkable, whereas briefly showing the classic
   * layout and then collapsing out of it would be the exact "flash of wrong state" this app
   * avoids elsewhere. Unlike that pattern's usual chicken-and-egg problem (the very first
   * measurement changing what there is to measure), this is safe on the first pass: it measures
   * this component's own width, which doesn't depend on which layout is currently rendered. */
  protected readonly containerWidth = signal(0);

  private readonly _pointsByDate = computed(() => {
    const map = new Map<string, SpottingActivityPoint[]>();
    for (const point of this.data()) {
      const existing = map.get(point.dateKey);
      if (existing) {
        existing.push(point);
      } else {
        map.set(point.dateKey, [point]);
      }
    }
    return map;
  });

  private readonly _countsByDate = computed(() => {
    const map = new Map<string, number>();
    for (const [dateKey, points] of this._pointsByDate()) {
      map.set(
        dateKey,
        points.reduce((sum, p) => sum + p.count, 0),
      );
    }
    return map;
  });

  protected readonly years = computed(() => {
    const yearsSet = new Set(this.data().map((p) => Number(p.dateKey.slice(0, 4))));
    yearsSet.add(new Date().getFullYear());
    return [...yearsSet].sort((a, b) => b - a);
  });

  private readonly _maxCount = computed(() => Math.max(1, ...this._countsByDate().values()));

  protected readonly weeks = computed<WeekColumn[]>(() => {
    const year = this.selectedYear();
    const counts = this._countsByDate();
    const points = this._pointsByDate();

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));

    const gridStart = new Date(start);
    gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
    const gridEnd = new Date(end);
    gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

    const weeks: WeekColumn[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const days: DayCell[] = [];
      for (let i = 0; i < 7; i++) {
        const key = dateKeyOf(cursor);
        const inYear = cursor.getUTCFullYear() === year;
        const breakdown = (points.get(key) ?? [])
          .map((p) => ({ type: p.eventType, count: p.count }))
          .sort((a, b) => b.count - a.count);
        days.push({
          date: key,
          count: inYear ? (counts.get(key) ?? 0) : 0,
          inYear,
          breakdown: inYear ? breakdown : [],
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      weeks.push({ days });
    }
    return weeks;
  });

  /** The same days as `weeks()`, flattened into chronological order with the out-of-year
   * padding dropped — what the compact layout renders, one flat sequence rather than
   * week-columns, so the grid's own left-to-right/top-to-bottom placement order matches actual
   * calendar order. */
  protected readonly flatDays = computed(() =>
    this.weeks().flatMap((week) => week.days.filter((day) => day.inYear)),
  );

  /** `minmax(12px, 1fr)` per week-column: a legible floor that grows evenly to fill any extra
   * width — safe from ever overflowing because `useClassicLayout` only switches this on once
   * measurement confirms the floor's total already fits. */
  protected readonly gridTemplateColumns = computed(
    () => `repeat(${this.weeks().length}, minmax(12px, 1fr))`,
  );

  /** How wide the classic layout needs to be to render at its floor size without overflowing:
   * every week-column at 12px plus the gaps between them, plus room for the year pills beside
   * it (only relevant in that layout — the compact one puts them above instead). */
  private readonly classicLayoutMinWidth = computed(() => {
    const n = this.weeks().length;
    return n * 12 + (n - 1) * 4 + YEARS_COLUMN_ESTIMATE_PX;
  });

  protected readonly useClassicLayout = computed(
    () => this.containerWidth() >= this.classicLayoutMinWidth(),
  );

  protected readonly totalForYear = computed(() =>
    this.weeks().reduce((sum, week) => sum + week.days.reduce((s, d) => s + d.count, 0), 0),
  );

  protected readonly funCaption = computed(() => {
    const total = this.totalForYear();
    const allTime = this.totalAllTime();
    const year = this.selectedYear();
    const noun = total === 1 ? "spotting" : "spottings";

    if (allTime === 0) {
      return "No spottings recorded yet — this year's canvas is still blank.";
    }
    const pct = Math.round((total / allTime) * 100);
    return `${total} ${noun} in ${year} — that's ${pct}% of the all-time total.`;
  });

  constructor() {
    afterNextRender(() => {
      const el = this.container().nativeElement;
      const ro = new ResizeObserver(([entry]) => this.containerWidth.set(entry.contentRect.width));
      ro.observe(el);
      this.destroyRef.onDestroy(() => ro.disconnect());

      // Same "measure, then verify shortly after" idiom app-nav's own _brandFits uses:
      // inside a CDK overlay (the vehicle-list hover preview's popover), this component can
      // mount before the overlay's own positioning pass has given it its final size — the
      // ResizeObserver's first callback then reports a too-small width, this falls back to
      // the compact layout, and since the container's real size settles at exactly the same
      // final value every time (it never resizes again afterward), no *further* observer
      // callback ever arrives to correct it, leaving it stuck showing the "left to right,
      // top to bottom" compact grid instead of the intended calendar-style one. A direct
      // re-read shortly after, independent of whether the observer fires again on its own,
      // closes that gap. Double rAF (not a guessed setTimeout delay): the first callback
      // runs before the browser's next paint, the second only after that paint has actually
      // happened, which is the standard way to wait for "at least one real layout settled"
      // without picking an arbitrary number of milliseconds.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.containerWidth.set(el.getBoundingClientRect().width)),
      );
    });
  }

  protected cellClass(count: number): string {
    return spottingIntensityClass(count, this._maxCount());
  }

  /** Pops the tooltip toward whichever side of the whole component currently has more room,
   * measured directly rather than guessed from a row index — the same rule works for either
   * layout, and for any position within it. */
  protected onHoverStart(day: DayCell, event: Event): void {
    this.hoveredDate.set(day.date);
    const cellRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const containerRect = this.container().nativeElement.getBoundingClientRect();
    const roomAbove = cellRect.top - containerRect.top;
    const roomBelow = containerRect.bottom - cellRect.bottom;
    this.tooltipAbove.set(roomAbove > roomBelow);
  }
}
