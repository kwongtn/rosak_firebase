import { Injectable, signal } from "@angular/core";
import { transit_realtime } from "gtfs-realtime-bindings";
import { IFeedEntity } from "./types";

/** `null` means "Do not refresh" — no timer gets scheduled at all once a fetch succeeds. */
export type RefreshIntervalMs = number | null;

export const DEFAULT_REFRESH_INTERVAL_MS = 30000;
/** The dropdown's own option list — see RefreshIntervalSelectComponent... this file doesn't own
 * UI, so the options list itself lives with the component that renders it (layer-checklist);
 * this constant is just the default every newly-applied source starts at. */

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 5 * 60 * 1000;
const TICK_MS = 100;

export interface RtSourceConfig {
    sourceUrl: string;
    intervalMs?: RefreshIntervalMs;
}

/**
 * One polling GTFS-realtime feed. Ported from RtGtfs in gtfs-rt-state.service.ts onto signals,
 * then reworked from a fixed `setInterval` into a self-rescheduling timer so a failed fetch can
 * back off (5s, 10s, 20s... capped at 5 minutes) without also racing the next *normal*-cadence
 * tick — there's only ever one "next attempt" scheduled at a time, whatever its delay is for.
 */
export class RtSource {
    private refreshIntervalMs: RefreshIntervalMs;
    private readonly sourceUrl: string;
    private attempt = 0;
    private nextRefreshAtMs = 0;
    private scheduledDelayMs = 0;
    private pollTimeout?: ReturnType<typeof setTimeout>;
    private tickInterval?: ReturnType<typeof setInterval>;

    readonly feedEntities = signal<IFeedEntity>({});
    /** True only while a fetch is actually in flight — distinct from `hasError`, which persists
     * between attempts so the UI can keep showing "this is broken" through the backoff wait,
     * not just during the brief request itself. */
    readonly isLoading = signal(false);
    /** Whether the *very first* fetch has completed at all yet (success or failure) — lets the
     * UI tell "still loading for the first time" (show an indeterminate spinner) apart from "a
     * later refresh happens to be in flight" (the countdown ring just keeps showing). */
    readonly hasLoadedOnce = signal(false);
    readonly hasError = signal(false);
    readonly lastErrorMessage = signal<string | null>(null);
    readonly secondsRemaining = signal(0);
    readonly percentRemaining = signal(0);

    constructor(config: RtSourceConfig) {
        this.sourceUrl = config.sourceUrl;
        this.refreshIntervalMs = config.intervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    }

    /** Changes the normal (non-error) refresh cadence. An error-backoff countdown already in
     * progress is left alone — a config change shouldn't cut short a retry wait that's already
     * committed to, it'll pick up the new cadence once it next succeeds. */
    setRefreshInterval(ms: RefreshIntervalMs): void {
        this.refreshIntervalMs = ms;
        if (!this.hasError()) {
            this.scheduleNext(ms ?? Infinity);
        }
    }

    /** Starts (or restarts, e.g. after `pause()`) this source: resumes the ticker and fetches
     * immediately rather than waiting out whatever delay was scheduled before pausing — that's
     * the "refresh once when coming back" behavior /tracker's shell page relies on. */
    resume(): void {
        clearInterval(this.tickInterval);
        this.tickInterval = setInterval(() => this.tick(), TICK_MS);
        this.refresh();
    }

    /** Stops all timers without discarding any state (feed data, error, attempt count) — for
     * navigating away from /tracker, not for permanently discarding this source (that's just
     * dropping the reference; nothing here needs an explicit destroy beyond this). */
    pause(): void {
        clearTimeout(this.pollTimeout);
        clearInterval(this.tickInterval);
    }

    /** Manual "Try Now" — jumps straight to a fetch, bypassing whatever's left of the current
     * backoff countdown. */
    retryNow(): void {
        clearTimeout(this.pollTimeout);
        this.refresh();
    }

    private tick(): void {
        const remainingMs = this.nextRefreshAtMs - Date.now();
        this.secondsRemaining.set(Math.max(0, remainingMs / 1000));
        this.percentRemaining.set(this.scheduledDelayMs > 0 ? Math.max(0, Math.min(100, (remainingMs * 100) / this.scheduledDelayMs)) : 0);
    }

    private scheduleNext(delayMs: number): void {
        clearTimeout(this.pollTimeout);
        this.scheduledDelayMs = delayMs;
        this.nextRefreshAtMs = Date.now() + delayMs;
        if (!Number.isFinite(delayMs)) {
            // "Do not refresh" — leave the countdown at whatever it last showed; there's nothing
            // further scheduled, so it simply stops ticking down.
            return;
        }
        this.pollTimeout = setTimeout(() => this.refresh(), delayMs);
    }

    private async refresh(): Promise<void> {
        this.isLoading.set(true);
        try {
            const res = await fetch(this.sourceUrl);
            if (!res.ok) {
                throw new Error(`${res.status} ${res.statusText}`);
            }
            const buffer = await res.arrayBuffer();
            const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
            const entities: IFeedEntity = { ...this.feedEntities() };
            for (const entity of feed.entity) {
                const id = entity.vehicle?.vehicle?.id;
                if (id) {
                    entities[id] = entity.vehicle;
                }
            }
            this.feedEntities.set(entities);
            this.attempt = 0;
            this.hasError.set(false);
            this.lastErrorMessage.set(null);
            this.scheduleNext(this.refreshIntervalMs ?? Infinity);
        } catch (err) {
            this.attempt += 1;
            this.hasError.set(true);
            this.lastErrorMessage.set(err instanceof Error ? err.message : String(err));
            this.scheduleNext(Math.min(RETRY_BASE_MS * 2 ** (this.attempt - 1), RETRY_MAX_MS));
        } finally {
            this.isLoading.set(false);
            this.hasLoadedOnce.set(true);
        }
    }
}

/**
 * Holds one RtSource per active realtime checkbox selection. Ported from GtfsRtStateService,
 * dropping its RxJS Subject-based added/deleted notifications in favor of letting consumers
 * (TrackerMapComponent) just diff `sources()`'s keys themselves in an effect.
 */
@Injectable({ providedIn: "root" })
export class GtfsRealtimeService {
    readonly sources = signal<Record<string, RtSource>>({});
    /** The shared refresh cadence every realtime source uses, changeable live from the layer
     * panel's "Refresh Interval" control — applies immediately to whatever's already active, not
     * just to sources created after the change. */
    readonly refreshIntervalMs = signal<RefreshIntervalMs>(DEFAULT_REFRESH_INTERVAL_MS);

    setRefreshInterval(ms: RefreshIntervalMs): void {
        this.refreshIntervalMs.set(ms);
        for (const source of Object.values(this.sources())) {
            source.setRefreshInterval(ms);
        }
    }

    upsertSources(configs: Record<string, RtSourceConfig>): void {
        const current = this.sources();
        const next: Record<string, RtSource> = {};

        for (const [key, source] of Object.entries(current)) {
            if (configs[key]) {
                next[key] = source;
            } else {
                source.pause();
            }
        }
        for (const [key, config] of Object.entries(configs)) {
            if (!next[key]) {
                next[key] = new RtSource({ ...config, intervalMs: this.refreshIntervalMs() });
                next[key].resume();
            }
        }
        this.sources.set(next);
    }

    /** Navigating away from /tracker — stop every active source's timers without losing their
     * state, so returning can pick up right where it left off. */
    pauseAll(): void {
        for (const source of Object.values(this.sources())) {
            source.pause();
        }
    }

    /** Navigating back to /tracker — resume every active source, fetching immediately rather
     * than waiting out whatever was left of its countdown when it was paused. */
    resumeAll(): void {
        for (const source of Object.values(this.sources())) {
            source.resume();
        }
    }
}
