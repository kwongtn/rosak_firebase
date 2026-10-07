import { Injectable, afterNextRender, effect, inject, signal } from "@angular/core";
import { injectIsBrowser } from "../composables/is-browser";

/** Who the board is tuned for: a quick glance (rider) or a dense operational view (pro). */
export type PreferencesViewMode = "rider" | "pro";

/** The whole persisted shape. Versioned by the storage key, never by the field names. */
export interface Preferences {
  pinnedLineIds: string[];
  viewMode: PreferencesViewMode;
  lastReportedLineId: string | null;
  recentLineIds: string[];
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

const DEFAULT_PREFERENCES: Preferences = {
  pinnedLineIds: [],
  viewMode: "rider",
  lastReportedLineId: null,
  recentLineIds: [],
};

function defaults(): Preferences {
  return {
    pinnedLineIds: [],
    viewMode: DEFAULT_PREFERENCES.viewMode,
    lastReportedLineId: null,
    recentLineIds: [],
  };
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
  };
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

  /**
   * False until the browser-only hydration pass has run. True forever on the server, where there
   * is no storage to hydrate — a host must therefore never gate user-visible UI on it.
   */
  private readonly _hydrated = signal(false);

  readonly pinnedLineIds = this._pinnedLineIds.asReadonly();
  readonly viewMode = this._viewMode.asReadonly();
  readonly lastReportedLineId = this._lastReportedLineId.asReadonly();
  readonly recentLineIds = this._recentLineIds.asReadonly();
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
    };
  }

  constructor() {
    if (!this._isBrowser) {
      return;
    }

    afterNextRender(() => {
      const stored = parseStoredPreferences(localStorage.getItem(STORAGE_KEY));
      this._pinnedLineIds.set(stored.pinnedLineIds);
      this._viewMode.set(stored.viewMode);
      this._lastReportedLineId.set(stored.lastReportedLineId);
      this._recentLineIds.set(stored.recentLineIds);
      this._hydrated.set(true);
    });

    effect(() => {
      // Gated on hydration: without it the first run of this effect would persist the DEFAULTS
      // over whatever the rider actually had stored, before the read above ever happened.
      if (!this._hydrated()) {
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot()));
    });
  }

  /** Pin the line if it is not pinned, unpin it if it is. A no-op for a blank id. */
  togglePin(lineId: string): void {
    if (lineId === "") {
      return;
    }
    this._pinnedLineIds.update((current) =>
      current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId],
    );
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
  }
}
