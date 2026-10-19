import { Injectable, afterNextRender, effect, inject, signal } from "@angular/core";
import { injectIsBrowser } from "../composables/is-browser";

/** Who the board is tuned for: a quick glance (rider) or a dense operational view (pro). */
export type PreferencesViewMode = "rider" | "pro";

/** How the Pro dashboard draws its lines: the grouped board, or one flat sortable table. */
export type ProLinesLayout = "board" | "table";

/** The columns the Pro lines table can sort by. */
export const PRO_LINES_SORT_COLUMNS = [
  "line",
  "status",
  "reports",
  "inService",
  "lastReport",
] as const;

export type ProLinesSortColumn = (typeof PRO_LINES_SORT_COLUMNS)[number];

export type ProLinesSortDirection = "asc" | "desc";

/** A table sort: which column, and which way. Stored whole so the pair cannot drift apart. */
export interface ProLinesSort {
  column: ProLinesSortColumn;
  direction: ProLinesSortDirection;
}

const PRO_LINES_LAYOUTS: readonly ProLinesLayout[] = ["board", "table"];
const PRO_LINES_SORT_DIRECTIONS: readonly ProLinesSortDirection[] = ["asc", "desc"];

/** The whole persisted shape. Versioned by the storage key, never by the field names. */
export interface Preferences {
  pinnedLineIds: string[];
  viewMode: PreferencesViewMode;
  lastReportedLineId: string | null;
  recentLineIds: string[];
  /** Set once the reader has seen the "pin your lines" hint or pinned a line, so it stops. */
  pinHintDismissed: boolean;
  /** The Pro dashboard's lines layout. A field added after v1 shipped: an older payload lacks it,
   * and {@link parseStoredPreferences} then reads the default, so the key does not change. */
  proLinesLayout: ProLinesLayout;
  /** The Pro lines table's sort. Same additive rule as {@link proLinesLayout}. */
  proLinesSort: ProLinesSort;
}

/**
 * Storage key. The `:v1` suffix is the migration seam: a shape change bumps it, so a stale
 * payload from an older deploy is orphaned rather than half-read into a field whose meaning
 * moved. Nothing reads the unversioned spelling.
 */
const STORAGE_KEY = "rosak:preferences:v1";

/** How many recently-viewed lines are remembered. Five reads as "the ones I was just on". */
export const MAX_RECENT_LINES = 5;

const VIEW_MODES: readonly PreferencesViewMode[] = ["rider", "pro"];

/** The Pro lines table's sort when nothing is stored: line code, A to Z. */
export const DEFAULT_PRO_LINES_SORT: ProLinesSort = { column: "line", direction: "asc" };

const DEFAULT_PREFERENCES: Preferences = {
  pinnedLineIds: [],
  viewMode: "rider",
  lastReportedLineId: null,
  recentLineIds: [],
  pinHintDismissed: false,
  proLinesLayout: "board",
  proLinesSort: DEFAULT_PRO_LINES_SORT,
};

function defaults(): Preferences {
  return {
    pinnedLineIds: [],
    viewMode: DEFAULT_PREFERENCES.viewMode,
    lastReportedLineId: null,
    recentLineIds: [],
    pinHintDismissed: false,
    proLinesLayout: DEFAULT_PREFERENCES.proLinesLayout,
    proLinesSort: { ...DEFAULT_PRO_LINES_SORT },
  };
}

/**
 * A stored table sort when both halves are recognised, else the default. The pair is validated
 * together: a column with a direction from some other shape would be a sort no header can show.
 */
function parseProLinesSort(value: unknown): ProLinesSort {
  if (!isRecord(value)) {
    return { ...DEFAULT_PRO_LINES_SORT };
  }
  const column = oneOf(value["column"], PRO_LINES_SORT_COLUMNS, DEFAULT_PRO_LINES_SORT.column);
  const direction = oneOf(
    value["direction"],
    PRO_LINES_SORT_DIRECTIONS,
    DEFAULT_PRO_LINES_SORT.direction,
  );
  return { column, direction };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A string array with blanks dropped and duplicates collapsed (first occurrence wins).
 * `cap` of `null` leaves the length alone — used for pins, whose count is bounded by the line
 * list itself rather than by a "recently visited" budget.
 */
function toIdList(value: unknown, cap: number | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry !== "") {
      seen.add(entry);
    }
    if (cap !== null && seen.size >= cap) {
      break;
    }
  }
  return [...seen];
}

/** The stored value when it is one of `allowed`, else the fallback. Unknown input never throws. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Turn a raw `localStorage` string into a complete `Preferences`.
 *
 * Every field is validated INDEPENDENTLY and falls back on its own, because a payload that is
 * half-recognisable (an older deploy wrote two of the four keys) is the common case, not an
 * edge case: dropping the whole object would silently unpin a rider's lines because one unrelated
 * key changed shape. A `JSON.parse` failure and a non-object payload both land on the defaults.
 * Keys this shape no longer has — a stale `density` — are simply unread, which is why nothing here
 * migrates them: the storage key is versioned, so an orphaned field needs no repair.
 */
export function parseStoredPreferences(raw: string | null | undefined): Preferences {
  const base = defaults();
  if (typeof raw !== "string" || raw === "") {
    return base;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!isRecord(parsed)) {
    return base;
  }
  return {
    pinnedLineIds: toIdList(parsed["pinnedLineIds"], null),
    viewMode: oneOf(parsed["viewMode"], VIEW_MODES, base.viewMode),
    lastReportedLineId:
      typeof parsed["lastReportedLineId"] === "string" && parsed["lastReportedLineId"] !== ""
        ? parsed["lastReportedLineId"]
        : null,
    recentLineIds: toIdList(parsed["recentLineIds"], MAX_RECENT_LINES),
    pinHintDismissed: parsed["pinHintDismissed"] === true,
    proLinesLayout: oneOf(parsed["proLinesLayout"], PRO_LINES_LAYOUTS, base.proLinesLayout),
    proLinesSort: parseProLinesSort(parsed["proLinesSort"]),
  };
}

/**
 * Storage access, wrapped because `localStorage` can throw (blocked site data, some private windows,
 * a full quota). A failed read degrades to the defaults and a failed write is dropped: the rider
 * loses persistence for this visit, not the page. Only ever called from browser-gated code.
 */
function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Persistence is best-effort; the in-memory signals still drive this visit's UI.
  }
}

/**
 * Reader-owned board display preferences, persisted in `localStorage`.
 *
 * Modelled on `ThemeService` (the repo's only other storage-backed signal service), with ONE
 * deliberate difference that SSR makes mandatory: the constructor **never reads storage**. It
 * builds with the defaults, then hydrates from `localStorage` inside `afterNextRender`, which does
 * not run on the server at all. Reading storage in the constructor would make the client's first
 * paint disagree with the server's HTML and throw an `NG0500` hydration mismatch the moment a
 * rider had pinned anything.
 *
 * The persist effect is gated on `_hydrated()` for the same reason from the other direction: an
 * ungated effect fires on its first run, which on a fresh page happens BEFORE hydration lands, and
 * would overwrite a real rider's stored preferences with the defaults they are about to inherit.
 */
@Injectable({ providedIn: "root" })
export class PreferencesService {
  private readonly _isBrowser = injectIsBrowser();

  private readonly _pinnedLineIds = signal<string[]>([]);
  private readonly _viewMode = signal<PreferencesViewMode>(DEFAULT_PREFERENCES.viewMode);
  private readonly _lastReportedLineId = signal<string | null>(null);
  private readonly _recentLineIds = signal<string[]>([]);
  private readonly _pinHintDismissed = signal(false);
  private readonly _proLinesLayout = signal<ProLinesLayout>(DEFAULT_PREFERENCES.proLinesLayout);
  private readonly _proLinesSort = signal<ProLinesSort>({ ...DEFAULT_PRO_LINES_SORT });

  /**
   * False until the browser-only hydration pass has run. True forever on the server, where there
   * is no storage to hydrate — a host must therefore never gate user-visible UI on it.
   */
  private readonly _hydrated = signal(false);

  readonly pinnedLineIds = this._pinnedLineIds.asReadonly();
  readonly viewMode = this._viewMode.asReadonly();
  readonly lastReportedLineId = this._lastReportedLineId.asReadonly();
  readonly recentLineIds = this._recentLineIds.asReadonly();
  readonly pinHintDismissed = this._pinHintDismissed.asReadonly();
  readonly proLinesLayout = this._proLinesLayout.asReadonly();
  readonly proLinesSort = this._proLinesSort.asReadonly();
  readonly hydrated = this._hydrated.asReadonly();

  /** True when the line is pinned. Reads the signal, so a template call stays reactive. */
  isPinned(lineId: string): boolean {
    return this._pinnedLineIds().includes(lineId);
  }

  /** The current values as a plain object — the exact shape written to storage. */
  snapshot(): Preferences {
    return {
      pinnedLineIds: this._pinnedLineIds(),
      viewMode: this._viewMode(),
      lastReportedLineId: this._lastReportedLineId(),
      recentLineIds: this._recentLineIds(),
      pinHintDismissed: this._pinHintDismissed(),
      proLinesLayout: this._proLinesLayout(),
      proLinesSort: this._proLinesSort(),
    };
  }

  constructor() {
    if (!this._isBrowser) {
      return;
    }

    afterNextRender(() => {
      const stored = parseStoredPreferences(readStorage());
      this._pinnedLineIds.set(stored.pinnedLineIds);
      this._viewMode.set(stored.viewMode);
      this._lastReportedLineId.set(stored.lastReportedLineId);
      this._recentLineIds.set(stored.recentLineIds);
      this._pinHintDismissed.set(stored.pinHintDismissed);
      this._proLinesLayout.set(stored.proLinesLayout);
      this._proLinesSort.set(stored.proLinesSort);
      this._hydrated.set(true);
    });

    effect(() => {
      // Gated on hydration: without it the first run of this effect would persist the DEFAULTS
      // over whatever the rider actually had stored, before the read above ever happened.
      if (!this._hydrated()) {
        return;
      }
      writeStorage(JSON.stringify(this.snapshot()));
    });
  }

  /** Pin the line if it is not pinned, unpin it if it is. A no-op for a blank id. */
  togglePin(lineId: string): void {
    if (lineId === "") {
      return;
    }
    // Pinning is the reader using the feature, so the "pin your lines" hint has done its job.
    if (!this.isPinned(lineId)) {
      this._pinHintDismissed.set(true);
    }
    this._pinnedLineIds.update((current) =>
      current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId],
    );
  }

  dismissPinHint(): void {
    this._pinHintDismissed.set(true);
  }

  setProLinesLayout(layout: ProLinesLayout): void {
    this._proLinesLayout.set(oneOf(layout, PRO_LINES_LAYOUTS, DEFAULT_PREFERENCES.proLinesLayout));
  }

  /** Stores a table sort. A column or direction outside its list falls back to the default. */
  setProLinesSort(sort: ProLinesSort): void {
    this._proLinesSort.set(parseProLinesSort(sort));
  }

  setViewMode(mode: PreferencesViewMode): void {
    this._viewMode.set(oneOf(mode, VIEW_MODES, DEFAULT_PREFERENCES.viewMode));
  }

  setLastReportedLine(lineId: string | null): void {
    this._lastReportedLineId.set(lineId === null || lineId === "" ? null : lineId);
  }

  /** Most-recent-first, de-duplicated, and capped at {@link MAX_RECENT_LINES}. */
  pushRecentLine(lineId: string): void {
    if (lineId === "") {
      return;
    }
    this._recentLineIds.update((current) =>
      [lineId, ...current.filter((id) => id !== lineId)].slice(0, MAX_RECENT_LINES),
    );
  }

  /** Back to defaults. Persisted, because the whole point is that the next reload agrees. */
  reset(): void {
    const fresh = defaults();
    this._pinnedLineIds.set(fresh.pinnedLineIds);
    this._viewMode.set(fresh.viewMode);
    this._lastReportedLineId.set(fresh.lastReportedLineId);
    this._recentLineIds.set(fresh.recentLineIds);
    this._pinHintDismissed.set(fresh.pinHintDismissed);
    this._proLinesLayout.set(fresh.proLinesLayout);
    this._proLinesSort.set(fresh.proLinesSort);
  }
}
