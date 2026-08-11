import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { observeHeight } from "../../../core/dom/observe-height";
import { HlmButton } from "../../../ui/button/button";
import { HlmSheet, HlmSheetBody, HlmSheetHeader } from "../../../ui/sheet/sheet";
import { GtfsRealtimeService } from "../data/gtfs-realtime.service";
import { GtfsStaticService } from "../data/gtfs-static.service";
import { LayerSelectionService } from "../data/layer-selection.service";
import { IFeedEntity } from "../data/types";

export type InfoPanelKind = "realtime" | "stops" | "railway";

interface TableRow {
  [column: string]: string | number;
}

type SortDir = 1 | -1;

const RING_RADIUS = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function toCsv(rows: TableRow[]): string {
  if (rows.length === 0) {
    return "";
  }
  const columns = Object.keys(rows[0]);
  const escape = (value: string | number) => {
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((col) => escape(row[col] ?? "")).join(",")),
  ];
  return lines.join("\n");
}

/** Escapes text for safe interpolation inside the `<span>` wrapper tags `highlightJson` itself
 * introduces — the *only* markup this ever produces, so escaping the raw text first and never
 * otherwise touching attribute values keeps `[innerHTML]` below safe against anything an upstream
 * feed's own string values might contain. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A small hand-rolled JSON syntax highlighter — this app already avoids pulling in a charting
 * library for one-off visualizations (see vehicle-status-trend's own doc comment); a colorized
 * `<pre>` is the same call: one regex pass distinguishing keys/strings/numbers/booleans/null is
 * plenty for a read-only debug dump, not worth a syntax-highlighting dependency. */
function highlightJson(json: string): string {
  const pattern =
    /("(\\u[a-fA-F0-9]{4}|\\.|[^"\\])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  return escapeHtml(json).replace(pattern, (match) => {
    let cls = "text-sky-600 dark:text-sky-400"; // number
    if (match.startsWith('"')) {
      cls = match.endsWith(":")
        ? "text-violet-600 dark:text-violet-400"
        : "text-emerald-600 dark:text-emerald-400"; // key : string
    } else if (match === "true" || match === "false") {
      cls = "text-amber-600 dark:text-amber-400";
    } else if (match === "null") {
      cls = "text-muted-foreground";
    }
    return `<span class="${cls}">${match}</span>`;
  });
}

/**
 * "What's actually behind this one layer row" — opened from a layer checklist row's own info
 * icon (see layer-checklist.component.ts), not a map-wide nav icon: a previous version of this
 * put a single "map info" button in the tracker's nav bar showing every active layer combined,
 * but that's not what was asked for — this is scoped to exactly the one layer whose icon was
 * clicked, same spirit as the doc-link icon it replaces (which only ever pointed at *that* row's
 * own source documentation, not a site-wide index). The doc link itself isn't dropped, just
 * moved inside this panel instead of being the icon's only job — a plain-language stats view, a
 * table of the underlying rows, and a raw JSON dump (with CSV export from the table) cover the
 * "debug this specific feed" need the doc link alone couldn't.
 */
@Component({
  selector: "app-tracker-info-panel",
  imports: [HlmSheet, HlmSheetHeader, HlmSheetBody, HlmButton],
  template: `
    <hlm-sheet
      [open]="open()"
      (openChange)="openChange.emit($event)"
      [side]="fullscreen() ? 'full' : 'bottom'"
    >
      <div hlmSheetHeader class="flex items-center justify-between gap-2">
        <h2 class="text-base font-semibold">{{ label() }}</h2>
        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center rounded-full outline-none"
            [attr.aria-label]="fullscreen() ? 'Exit full screen' : 'Full screen'"
            [title]="fullscreen() ? 'Exit full screen' : 'Full screen'"
            (click)="fullscreen.set(!fullscreen())"
          >
            @if (fullscreen()) {
              <svg
                viewBox="0 0 24 24"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"
                />
              </svg>
            } @else {
              <svg
                viewBox="0 0 24 24"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"
                />
              </svg>
            }
          </button>
          <button
            type="button"
            class="text-muted-foreground hover:bg-muted hover:text-foreground -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full outline-none"
            aria-label="Close"
            title="Close"
            (click)="openChange.emit(false)"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <!-- pt-0!: cancels hlmSheetBody's own top padding specifically (its p-5 host class
                 still gives left/right/bottom padding) — confirmed live that a sticky child can
                 never cover its scrollport's own top padding no matter what margin tricks it
                 tries (position: sticky's offsets clamp against the scrollport's *content* edge,
                 which sits *below* that padding, not its outer edge), so a scrolled-past table
                 row was still visible peeking through that padding gap above the "stuck" tabs
                 row. #tabsRow reproduces the lost visual spacing with its own pt-5 instead — since
                 that's its own padding, its solid background actually covers it. -->
      <div hlmSheetBody class="overflow-x-auto pt-0!">
        <!-- bg-popover sticky top-0: pins this row to the top of the sheet body's own
                     scrollport (hlmSheetBody genuinely scrolls both axes now — see the class
                     added above — so this is real, working sticky, not the coerced-scroll-
                     container trap a nested overflow-auto div would create; see the Table view's
                     own thead comment below for why that trap matters here specifically). #tabsRow
                     is measured so the table header (below) knows exactly how far down to stick
                     itself, the same "measure, don't guess" pattern as every other stacked sticky
                     bar in this app. z-20, one above the table header's own z-10, so this row
                     always wins if they ever visually overlap by a pixel during a fast scroll. -->
        <div
          #tabsRow
          class="bg-popover sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-1.5 pt-5 pb-2"
        >
          <button
            hlmBtn
            [variant]="view() === 'overview' ? 'default' : 'outline'"
            size="sm"
            (click)="view.set('overview')"
          >
            Overview
          </button>
          @if (rows().length > 0) {
            <button
              hlmBtn
              [variant]="view() === 'table' ? 'default' : 'outline'"
              size="sm"
              (click)="view.set('table')"
            >
              Table
            </button>
          }
          <button
            hlmBtn
            [variant]="view() === 'json' ? 'default' : 'outline'"
            size="sm"
            (click)="view.set('json')"
          >
            Raw JSON
          </button>

          @if (rtSource(); as source) {
            <!-- Synced to the *actual* poll countdown (RtSource's own percentRemaining)
                             rather than a decorative spinner — but the table/JSON below are a frozen
                             snapshot (see refreshSnapshot), not this live source, so the ring
                             completing doesn't itself change what's on screen. Once the underlying
                             feed has genuinely produced newer data than that snapshot (isStale),
                             the ring is replaced by an explicit "!" prompt instead of silently
                             looping back to full — otherwise a still-ticking ring right next to a
                             frozen table reads as "this can't be trusted", not "this is current". -->
            <button
              type="button"
              class="ml-1 flex items-center gap-1.5 text-xs"
              [attr.aria-label]="
                isStale() ? 'Newer data available — click to update' : 'Time until next refresh'
              "
              [title]="
                isStale() ? 'Newer data available — click to update' : 'Time until next refresh'
              "
              (click)="refreshSnapshot()"
            >
              @if (isStale()) {
                <span class="text-destructive flex size-4 items-center justify-center font-bold"
                  >!</span
                >
                <span class="text-muted-foreground">New data — click to update</span>
              } @else {
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 18 18"
                  class="-rotate-90"
                  aria-hidden="true"
                >
                  <circle
                    cx="9"
                    cy="9"
                    r="8"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="text-muted-foreground/20"
                  />
                  <circle
                    cx="9"
                    cy="9"
                    r="8"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    class="text-primary transition-[stroke-dashoffset] duration-150 ease-linear"
                    [attr.stroke-dasharray]="RING_CIRCUMFERENCE"
                    [attr.stroke-dashoffset]="ringDashOffset()"
                  />
                </svg>
              }
            </button>
          }

          @if (docsUrl(); as url) {
            <a
              [href]="url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-muted-foreground hover:text-foreground ml-auto text-xs underline"
            >
              Source documentation ↗
            </a>
          }
        </div>

        @if (view() === "overview") {
          <div class="flex flex-col gap-4 text-sm">
            <div class="flex gap-6">
              <div>
                <div class="text-2xl font-semibold tabular-nums">{{ overviewValue() }}</div>
                <div class="text-muted-foreground text-xs">{{ overviewLabel() }}</div>
              </div>
            </div>
            @if (kind() === "railway") {
              <p class="text-muted-foreground">
                This layer is a single always-on/off overlay rather than a set of individually
                tracked items, so there's no per-row table or breakdown to show here — just whether
                it's currently applied to the map.
              </p>
            }
          </div>
        } @else if (view() === "table") {
          <!-- No wrapping overflow-auto div around this table (there used to be one,
                         purely for independent horizontal scroll) — *any* ancestor with overflow
                         other than visible on either axis becomes the containing block for
                         position: sticky descendants (the CSS Overflow spec's "coerce visible to
                         auto on the other axis" rule turns even an overflow-x-only div into a
                         trap for both axes), and that div never itself scrolled vertically — so a
                         sticky <thead> inside it would stick relative to *that* box, not to
                         hlmSheetBody's real scroll, and never actually engage. hlmSheetBody now
                         owns horizontal overflow directly (see the class on the div above) so this
                         table can sit as its plain, un-wrapped child and still get working sticky
                         top-N-px headers against the *real* scrollport. -->
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="bg-popover sticky z-10 border-b" [style.top.px]="tabsRowHeight()">
                @for (col of tableColumns(); track col) {
                  <th class="p-0 font-medium whitespace-nowrap">
                    <button
                      type="button"
                      class="hover:bg-muted flex w-full items-center gap-1 px-2 py-1 text-left"
                      (click)="onSortClick(col)"
                    >
                      {{ col }}
                      @if (sortState()?.col === col) {
                        <span class="text-muted-foreground">{{
                          sortState()?.dir === 1 ? "▲" : "▼"
                        }}</span>
                      }
                    </button>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of sortedRows(); track $index) {
                <tr class="border-b">
                  @for (col of tableColumns(); track col) {
                    <td class="px-2 py-1 whitespace-nowrap">{{ formatCell(col, row[col]) }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
          <button hlmBtn variant="outline" size="sm" class="mt-3" (click)="onExportCsv()">
            Export CSV
          </button>
        } @else {
          <div class="flex flex-col gap-2">
            <button hlmBtn variant="outline" size="sm" class="self-start" (click)="onCopyJson()">
              {{ copied() ? "Copied!" : "Copy JSON" }}
            </button>
            <pre
              class="bg-muted max-h-[50vh] overflow-auto rounded-lg p-3 text-xs"
              [innerHTML]="highlightedJson()"
            ></pre>
          </div>
        }
      </div>
    </hlm-sheet>
  `,
})
export class TrackerInfoPanelComponent {
  readonly open = input(false);
  readonly openChange = output<boolean>();

  readonly kind = input.required<InfoPanelKind>();
  /** The specific checkbox's value (e.g. "ktmb") — unused (always null) for `kind: "railway"`,
   * which has exactly one always-on/off overlay rather than a set of individually keyed items. */
  readonly sourceKey = input<string | null>(null);
  readonly label = input.required<string>();
  readonly docsUrl = input<string | null>(null);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly gtfsRealtime = inject(GtfsRealtimeService);
  private readonly gtfsStatic = inject(GtfsStaticService);
  private readonly layerSelection = inject(LayerSelectionService);

  protected readonly RING_CIRCUMFERENCE = RING_CIRCUMFERENCE;
  /** The sticky tabs row's own real height — the Table view's sticky <thead> stacks directly
   * beneath it, at exactly this offset, same "measure, don't guess" pattern as every other
   * stacked sticky bar in this app (see observeHeight's own doc comment). */
  private readonly tabsRow = viewChild<ElementRef<HTMLElement>>("tabsRow");
  protected readonly tabsRowHeight = signal(0);
  protected readonly view = signal<"overview" | "table" | "json">("overview");
  protected readonly copied = signal(false);
  protected readonly fullscreen = signal(false);
  protected readonly sortState = signal<{ col: string; dir: SortDir } | null>(null);

  /** The realtime source behind this panel, if any — exposed so the template can drive the
   * refresh-countdown ring straight off it without this component re-deriving its own timer. */
  protected readonly rtSource = computed(() => {
    const key = this.sourceKey();
    return this.kind() === "realtime" && key ? this.gtfsRealtime.sources()[key] : undefined;
  });
  protected readonly ringDashOffset = computed(() => {
    const source = this.rtSource();
    return (
      RING_CIRCUMFERENCE *
      (1 - (source ? Math.max(0, Math.min(100, source.percentRemaining())) : 0) / 100)
    );
  });

  /** Live feed data — read reactively, but never rendered directly (see `snapshotVehicles`):
   * the panel is explicitly not supposed to update its Table/Raw JSON view on its own while
   * open, only the moment the user clicks the refresh prompt. */
  private readonly _liveVehicles = computed<IFeedEntity>(() => {
    const key = this.sourceKey();
    if (this.kind() !== "realtime" || !key) {
      return {};
    }
    return this.gtfsRealtime.sources()[key]?.feedEntities() ?? {};
  });

  /** What Table/Raw JSON actually render for `kind: "realtime"` — a frozen copy taken on open
   * (or on a row switch while already open) and again on demand via `refreshSnapshot()`.
   * `_stops`/railway have no polling cycle of their own (GtfsStaticService loads once; the
   * railway overlay is a plain boolean toggle) — "live" and "current" already mean the same
   * thing there, so only the realtime feed needs this freeze-until-refresh treatment at all. */
  protected readonly snapshotVehicles = signal<IFeedEntity>({});
  /** True once the live feed has produced data the current snapshot hasn't shown yet — object
   * identity, not a deep diff: `RtSource.refresh()` always calls `feedEntities.set(...)` with a
   * new object on every successful poll, even if the underlying values happen to be unchanged,
   * so a reference mismatch reliably means "a newer fetch has landed since this snapshot". */
  protected readonly isStale = computed(
    () => this.kind() === "realtime" && this._liveVehicles() !== this.snapshotVehicles(),
  );

  private readonly _stops = computed(() => {
    const key = this.sourceKey();
    if (this.kind() !== "stops" || !key) {
      return [] as Array<{
        id?: string | number | undefined;
        properties: Record<string, unknown> | null;
        geometry: { coordinates: number[] };
      }>;
    }
    return this.gtfsStatic.sources()[key]?.stops().features ?? [];
  });

  protected readonly overviewLabel = computed(() => {
    switch (this.kind()) {
      case "realtime":
        return "Vehicles tracked";
      case "stops":
        return "Stops loaded";
      case "railway":
        return "Railway overlay";
    }
  });

  protected readonly overviewValue = computed<string | number>(() => {
    switch (this.kind()) {
      case "realtime":
        return Object.keys(this.snapshotVehicles()).length;
      case "stops":
        return this._stops().length;
      case "railway":
        return this.layerSelection.appliedRailway() ? "On" : "Off";
    }
  });

  protected readonly tableColumns = computed<string[]>(() =>
    this.rows().length > 0 ? Object.keys(this.rows()[0]) : [],
  );

  protected readonly rows = computed<TableRow[]>(() => {
    if (this.kind() === "realtime") {
      return Object.entries(this.snapshotVehicles())
        .filter(([, v]) => v != null)
        .map(([id, v]) => ({
          vehicleId: v!.vehicle?.id ?? id,
          label: v!.vehicle?.label ?? "",
          tripId: v!.trip?.tripId ?? "",
          latitude: v!.position?.latitude ?? "",
          longitude: v!.position?.longitude ?? "",
          bearing: v!.position?.bearing ?? "",
          timestamp: String(v!.timestamp ?? ""),
        }));
    }
    if (this.kind() === "stops") {
      return this._stops().map((f) => ({
        stopId: (f.properties?.["stop_id"] as string | number | undefined) ?? f.id ?? "",
        stopName: (f.properties?.["stop_name"] as string | undefined) ?? "",
        longitude: f.geometry.coordinates[0],
        latitude: f.geometry.coordinates[1],
      }));
    }
    return [];
  });

  protected readonly sortedRows = computed(() => {
    const state = this.sortState();
    const rows = this.rows();
    if (!state) {
      return rows;
    }
    const { col, dir } = state;
    return [...rows].sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  });

  protected readonly jsonText = computed(() => {
    if (this.kind() === "realtime") {
      return JSON.stringify(this.snapshotVehicles(), null, 2);
    }
    if (this.kind() === "stops") {
      return JSON.stringify(this._stops(), null, 2);
    }
    return JSON.stringify({ applied: this.layerSelection.appliedRailway() }, null, 2);
  });

  protected readonly highlightedJson = computed(() => highlightJson(this.jsonText()));

  constructor() {
    observeHeight(this.tabsRow, (h) => this.tabsRowHeight.set(h));

    // Takes a fresh snapshot whenever the panel opens, and again if the row it's scoped to
    // changes while it's already open (switching straight from one layer's info icon to
    // another's, without closing in between) — but NOT on every live feed update, which is
    // the whole point of freezing in the first place. `untracked` keeps refreshSnapshot()'s
    // own signal reads from becoming dependencies of this effect; only open()/kind()/
    // sourceKey() should ever re-trigger it.
    effect(() => {
      const isOpen = this.open();
      this.kind();
      this.sourceKey();
      if (isOpen) {
        untracked(() => this.refreshSnapshot());
      }
    });
  }

  protected refreshSnapshot(): void {
    this.snapshotVehicles.set(this._liveVehicles());
  }

  /** `timestamp` is the one column GTFS-realtime feeds actually populate with something a raw
   * number obscures (Unix seconds) — every other column is already human-readable as-is. */
  protected formatCell(col: string, value: string | number): string {
    if (col === "timestamp") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) {
        const date = new Date(seconds * 1000);
        if (!Number.isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      }
    }
    return String(value);
  }

  protected onSortClick(col: string): void {
    this.sortState.update((state) => {
      if (!state || state.col !== col) {
        return { col, dir: 1 };
      }
      return state.dir === 1 ? { col, dir: -1 } : null;
    });
  }

  protected async onCopyJson(): Promise<void> {
    await navigator.clipboard.writeText(this.jsonText());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  protected onExportCsv(): void {
    if (!this.isBrowser) {
      return;
    }
    const csv = toCsv(this.sortedRows());
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.sourceKey() ?? this.kind()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
