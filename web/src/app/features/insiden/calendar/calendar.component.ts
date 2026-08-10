import { Component, OnDestroy, computed, input, linkedSignal, output, signal } from "@angular/core";
import { HlmButton } from "../../../ui/button/button";
import { ComboboxItem, HlmCombobox } from "../../../ui/combobox/combobox";
import { CalendarIncident, CalendarIncidentSeverity } from "../data/insiden.queries";
import { dateKeyOf, incidentCoversDate } from "../data/calendar-date.util";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const SEVERITY_DOT: Record<CalendarIncidentSeverity, string> = {
    MAJOR: "bg-destructive",
    MINOR: "bg-amber-500",
    OTHERS: "bg-neutral-400",
};

/** How long a month/year jump waits after a selection before committing — long enough to pick
 * the other field too without it firing mid-choice, short enough not to feel ignored. Blurring
 * either field skips the rest of this wait and commits right away (see `onFieldBlur`). */
const JUMP_COMMIT_MS = 3000;

interface DayCell {
    dateKey: string;
    day: number;
    inMonth: boolean;
    isToday: boolean;
    severities: CalendarIncidentSeverity[];
    count: number;
}

/**
 * Month-grid calendar, one dot per severity present that day (multi-day incidents show on every
 * day they cover, not just the day they started — see calendar-date.util.ts). Deliberately not a
 * spartan/CDK date-picker: the old app's ng-zorro NzCalendar isn't available here, and a plain
 * hand-rolled grid is simple enough not to need a component library for it (same reasoning as
 * this app's other primitives — combobox, sheet, etc).
 *
 * The month/year jump reuses the shared searchable combobox rather than a raw text input: the
 * month/year labels stay put and keep looking like plain text the whole time — clicking one
 * opens a real dropdown under it (typeable, filtered) rather than swapping the label itself into
 * an editable field. Selecting from either starts the countdown; picking the other one restarts
 * it; leaving both fields (blur) commits immediately with whatever was last selected.
 */
@Component({
    selector: "app-incident-calendar",
    imports: [HlmButton, HlmCombobox],
    template: `
        <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
                <h2 class="flex items-baseline gap-1">
                    <hlm-combobox
                        class="field-sizing-content min-w-8 !border-none !bg-transparent !py-0 !pl-0 text-lg font-semibold"
                        [items]="monthItems()"
                        [value]="displayedMonth()"
                        (valueChange)="onMonthSelected($event)"
                        (focusout)="onFieldBlur()"
                        emptyMessage="No matching months"
                    />
                    <hlm-combobox
                        class="field-sizing-content min-w-10 !border-none !bg-transparent !py-0 !pl-0 text-lg font-semibold"
                        [items]="yearItems()"
                        [value]="displayedYear()"
                        (valueChange)="onYearSelected($event)"
                        (focusout)="onFieldBlur()"
                        emptyMessage="No matching years"
                    />
                    @if (jumpCounting()) {
                        <svg viewBox="0 0 24 24" class="text-primary size-3.5 shrink-0 -rotate-90" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-20" />
                            <circle
                                cx="12"
                                cy="12"
                                r="9"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2.5"
                                stroke-linecap="round"
                                [attr.stroke-dasharray]="JUMP_RING_CIRCUMFERENCE"
                                [attr.stroke-dashoffset]="JUMP_RING_CIRCUMFERENCE * jumpProgress()"
                            />
                        </svg>
                    }
                </h2>
                <div class="flex items-center gap-1.5">
                    <button hlmBtn variant="outline" size="sm" (click)="goToday()">Today</button>
                    <button hlmBtn variant="outline" size="sm" aria-label="Previous month" (click)="shiftMonth(-1)">‹</button>
                    <button hlmBtn variant="outline" size="sm" aria-label="Next month" (click)="shiftMonth(1)">›</button>
                </div>
            </div>

            <div class="grid grid-cols-7 gap-1">
                @for (label of weekdayLabels; track label) {
                    <div class="text-muted-foreground py-1 text-center text-xs font-medium">{{ label }}</div>
                }
                @for (cell of weeks(); track cell.dateKey) {
                    <button
                        type="button"
                        class="flex aspect-square flex-col items-start justify-start gap-1 rounded-lg p-1.5 text-sm transition-colors md:items-center md:justify-center md:p-0"
                        [class.text-muted-foreground]="!cell.inMonth"
                        [class.bg-primary]="cell.dateKey === selectedDate()"
                        [class.text-primary-foreground]="cell.dateKey === selectedDate()"
                        [class.hover:bg-muted]="cell.dateKey !== selectedDate()"
                        [class.ring-1]="cell.isToday && cell.dateKey !== selectedDate()"
                        [class.ring-border]="cell.isToday && cell.dateKey !== selectedDate()"
                        [title]="cell.count > 0 ? cell.count + ' incident' + (cell.count === 1 ? '' : 's') : ''"
                        (click)="daySelected.emit(cell.dateKey)"
                    >
                        {{ cell.day }}
                        <span class="flex h-1.5 items-center gap-0.5">
                            @for (severity of cell.severities; track severity) {
                                <span class="size-1.5 rounded-full" [class]="dotClass(severity)"></span>
                            }
                        </span>
                    </button>
                }
            </div>
        </div>
    `,
})
export class IncidentCalendarComponent implements OnDestroy {
    readonly incidents = input.required<CalendarIncident[]>();
    readonly selectedDate = input.required<string>();
    readonly daySelected = output<string>();

    protected readonly weekdayLabels = WEEKDAY_LABELS;
    protected readonly JUMP_RING_CIRCUMFERENCE = 2 * Math.PI * 9;

    /** Tracks `selectedDate()`'s own month by default — so a direct link to a past/future date
     * lands on a grid that actually contains the day it's meant to be highlighting. `shiftMonth`/
     * `goToday`/the month-year jump all write here directly for instant feedback, and also emit a
     * matching `daySelected` in the same gesture (see `jumpToMonth`) so the day-scoped incident
     * list below never goes stale relative to what the grid is showing. Exactly `linkedSignal`'s
     * use case, rather than a plain `signal` (can't derive-with-override) or `computed` (can't be
     * written to at all). */
    protected readonly viewedMonth = linkedSignal(() => startOfMonth(dateFromKey(this.selectedDate())));

    protected readonly monthItems = computed<ComboboxItem<number>[]>(() =>
        MONTH_NAMES.map((name, idx) => ({ label: name, value: idx, searchTerms: [String(idx + 1)] }))
    );

    /** Spans from the earliest year with any incident through one year ahead of today — the same
     * "recent past through near future" range the old app's own year picker used, just derived
     * from the real data instead of a hardcoded start year. Newest first: jumping to a *different*
     * year is far more often "a recent one" than "deep history". */
    protected readonly yearItems = computed<ComboboxItem<number>[]>(() => {
        const now = new Date().getUTCFullYear();
        const incidentYears = this.incidents().map((i) => new Date(i.startDatetime).getUTCFullYear());
        const minYear = Math.min(now, ...incidentYears);
        const maxYear = Math.max(now + 1, ...incidentYears);
        const items: ComboboxItem<number>[] = [];
        for (let y = maxYear; y >= minYear; y--) {
            items.push({ label: String(y), value: y });
        }
        return items;
    });

    /** A selection the user has made but not yet committed — `null` means "no pending change,
     * defer to `viewedMonth`". Separate signals (rather than one combined "pending date") because
     * the month and year combobox each only ever report their own field changing. */
    private readonly pendingMonth = signal<number | null>(null);
    private readonly pendingYear = signal<number | null>(null);
    protected readonly displayedMonth = computed(() => this.pendingMonth() ?? this.viewedMonth().getUTCMonth());
    protected readonly displayedYear = computed(() => this.pendingYear() ?? this.viewedMonth().getUTCFullYear());

    /** True for the JUMP_COMMIT_MS window after the last selection, during which the countdown
     * ring shows and a further selection restarts it. */
    protected readonly jumpCounting = signal(false);
    /** 0 → 1 over `JUMP_COMMIT_MS`; drives the countdown ring's `stroke-dashoffset`. */
    protected readonly jumpProgress = signal(0);

    private commitTimeout: ReturnType<typeof setTimeout> | undefined;
    private progressInterval: ReturnType<typeof setInterval> | undefined;

    /** The 42-cell (6-week) grid always starts on the Sunday on/before the 1st of the month —
     * shared by `weeks()` and `_countsByDate()` so they can never drift out of sync with each
     * other about which 42 days are actually on screen. */
    private readonly _gridStart = computed(() => {
        const gridStart = new Date(this.viewedMonth());
        gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
        return gridStart;
    });

    /** Long-term incidents are deliberately excluded here: they already have their own permanent
     * home in the "Ongoing & Long-Running" section regardless of the selected day, so counting
     * them again on every single day they happen to span would just repeat the same dot across
     * an entire month (sometimes several) without telling the viewer anything new. */
    private readonly _countsByDate = computed(() => {
        const map = new Map<string, Map<CalendarIncidentSeverity, number>>();
        const cursor = new Date(this._gridStart());
        const shortTermIncidents = this.incidents().filter((incident) => !incident.longTerm);
        for (let i = 0; i < 42; i++) {
            const key = dateKeyOf(cursor);
            for (const incident of shortTermIncidents) {
                if (!incidentCoversDate(incident, key)) {
                    continue;
                }
                const bySeverity = map.get(key) ?? new Map<CalendarIncidentSeverity, number>();
                bySeverity.set(incident.severity, (bySeverity.get(incident.severity) ?? 0) + 1);
                map.set(key, bySeverity);
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return map;
    });

    /** One dot per severity present, per day — the calendar's only "are there incidents here"
     * indicator (deliberately just a presence dot, not a count: a day's exact incident count is
     * one click away in the day-scoped list, and cramming a number into a 24px cell reads worse
     * than it helps). */
    protected readonly weeks = computed<DayCell[]>(() => {
        const month = this.viewedMonth().getUTCMonth();
        const todayKey = dateKeyOf(new Date());
        const counts = this._countsByDate();

        const cells: DayCell[] = [];
        const cursor = new Date(this._gridStart());
        for (let i = 0; i < 42; i++) {
            const key = dateKeyOf(cursor);
            const bySeverity = counts.get(key);
            cells.push({
                dateKey: key,
                day: cursor.getUTCDate(),
                inMonth: cursor.getUTCMonth() === month,
                isToday: key === todayKey,
                severities: bySeverity ? [...bySeverity.keys()] : [],
                count: bySeverity ? [...bySeverity.values()].reduce((a, b) => a + b, 0) : 0,
            });
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return cells;
    });

    protected onMonthSelected(monthIdx: number | undefined): void {
        if (monthIdx === undefined) {
            return;
        }
        this.pendingMonth.set(monthIdx);
        this.restartJumpCountdown();
    }

    protected onYearSelected(year: number | undefined): void {
        if (year === undefined) {
            return;
        }
        this.pendingYear.set(year);
        this.restartJumpCountdown();
    }

    /** Leaving either field skips the rest of the wait and commits with whatever was last picked
     * — a no-op if nothing's actually pending (e.g. the field was focused and blurred without a
     * new selection). */
    protected onFieldBlur(): void {
        if (!this.jumpCounting()) {
            return;
        }
        this.clearJumpTimers();
        this.jumpCounting.set(false);
        this.commitJump();
    }

    private restartJumpCountdown(): void {
        this.clearJumpTimers();
        this.jumpCounting.set(true);
        this.jumpProgress.set(0);
        const start = Date.now();
        this.progressInterval = setInterval(() => {
            this.jumpProgress.set(Math.min(1, (Date.now() - start) / JUMP_COMMIT_MS));
        }, 50);
        this.commitTimeout = setTimeout(() => {
            this.jumpCounting.set(false);
            this.commitJump();
            // Only here, not in onFieldBlur: during a real blur, document.activeElement has
            // already moved on to whatever's receiving focus next (e.g. the other combobox, when
            // tabbing between them) — blurring "the active element" at that point would yank
            // focus back off of it. When the timer runs its full course instead, nothing else has
            // taken focus, so this correctly defocuses whichever combobox the selection was left
            // sitting in, rather than leaving it looking mid-edit once the jump is done.
            (document.activeElement as HTMLElement | null)?.blur();
        }, JUMP_COMMIT_MS);
    }

    private commitJump(): void {
        const monthIdx = this.pendingMonth() ?? this.viewedMonth().getUTCMonth();
        const year = this.pendingYear() ?? this.viewedMonth().getUTCFullYear();
        this.pendingMonth.set(null);
        this.pendingYear.set(null);
        this.jumpToMonth(new Date(Date.UTC(year, monthIdx, 1)));
    }

    private clearJumpTimers(): void {
        clearTimeout(this.commitTimeout);
        clearInterval(this.progressInterval);
    }

    protected shiftMonth(delta: number): void {
        const next = new Date(this.viewedMonth());
        next.setUTCMonth(next.getUTCMonth() + delta);
        this.jumpToMonth(next);
    }

    protected goToday(): void {
        this.viewedMonth.set(startOfMonth(new Date()));
        this.daySelected.emit(dateKeyOf(new Date()));
    }

    /** Moves the grid to `monthStart` and re-selects a day in it, so the day-scoped incident list
     * below never shows a day from whatever month used to be on screen. Preserves the previously
     * selected day-of-month where that's a real day in the new month (typical case), and clamps
     * to the new month's last day otherwise (e.g. selected the 31st, moved to a 30-day month). */
    private jumpToMonth(monthStart: Date): void {
        const day = dateFromKey(this.selectedDate()).getUTCDate();
        this.viewedMonth.set(monthStart);
        this.daySelected.emit(dateKeyOf(clampToMonth(monthStart, day)));
    }

    protected dotClass(severity: CalendarIncidentSeverity): string {
        return SEVERITY_DOT[severity];
    }

    ngOnDestroy(): void {
        this.clearJumpTimers();
    }
}

function startOfMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function dateFromKey(dateKey: string): Date {
    return new Date(`${dateKey}T00:00:00Z`);
}

/** `day` within `monthStart`'s month, clamped down to that month's last real day (e.g. 31 → 28/29/30
 * for a shorter month). Day 0 of the *next* month is a well-known trick for "the last day of this
 * month" — `Date.UTC` normalizes an out-of-range day-of-month by rolling over automatically. */
function clampToMonth(monthStart: Date, day: number): Date {
    const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(day, daysInMonth)));
}
