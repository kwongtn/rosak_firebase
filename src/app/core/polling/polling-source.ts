import { isPlatformBrowser } from "@angular/common";
import { DestroyRef, PLATFORM_ID, inject, signal } from "@angular/core";

/** `null` = "Never refresh" — no timer, no countdown, nothing scheduled. */
export type PollingIntervalMs = number | null;

export const DEFAULT_POLLING_INTERVAL_MS = 30000;

/**
 * A tiny self-contained polling beat for a zoneless data section: one self-rescheduling
 * `setTimeout` fires `onRefresh` on the current cadence and immediately reschedules itself, while
 * a 1-second `setInterval` tick keeps `secondsRemaining` (and `percentRemaining`) honest. Modeled
 * on tracker's RtSource (gtfs-realtime.service.ts) but a fraction of it — no fetch, no backoff,
 * no error state: the data owner (a `graphqlResource`-backed section) supplies the refresh
 * callback and owns loading/error rendering.
 *
 * Created from a component constructor (or field initializer, which runs in the injection
 * context) — uses `inject` for the platform check and `DestroyRef` for cleanup, so a section
 * that mounts/unmounts via `@if` starts polling when it appears and stops when it leaves. The
 * only *mandatory* guard is the platform one: timers exist on the server process too, and a
 * polling timer scheduled during SSR must never run there.
 */
export class PollingSource {
  readonly intervalMs = signal<PollingIntervalMs>(DEFAULT_POLLING_INTERVAL_MS);
  readonly secondsRemaining = signal(0);
  readonly percentRemaining = signal(0);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private readonly onRefresh: () => void;

  private nextRefreshAtMs = 0;
  private scheduledDelayMs = 0;
  private pollTimeout: ReturnType<typeof setTimeout> | undefined;
  private tickInterval: ReturnType<typeof setInterval> | undefined;

  constructor(onRefresh: () => void) {
    this.onRefresh = onRefresh;
    if (this.isBrowser) {
      this.scheduleNext(this.intervalMs() ?? Infinity);
    }
    this.destroyRef.onDestroy(() => this.stop());
  }

  /** Changes the cadence and rescales the countdown from *now* — whatever was scheduled before
   * is canceled, so a slower interval can never race a stale faster deadline. */
  setIntervalMs(ms: PollingIntervalMs): void {
    this.intervalMs.set(ms);
    this.scheduleNext(ms ?? Infinity);
  }

  /** Manual "refresh now": fires immediately, then restarts the countdown for the current
   * interval (or stays off if the interval is `null` — a one-shot manual fetch is still a
   * reasonable reading of "Never"). */
  refreshNow(): void {
    this.onRefresh();
    this.scheduleNext(this.intervalMs() ?? Infinity);
  }

  private scheduleNext(delayMs: number): void {
    clearTimeout(this.pollTimeout);
    this.pollTimeout = undefined;
    this.scheduledDelayMs = delayMs;
    this.nextRefreshAtMs = Date.now() + delayMs;
    this.secondsRemaining.set(Number.isFinite(delayMs) ? Math.ceil(delayMs / 1000) : 0);
    if (!Number.isFinite(delayMs)) {
      // "Never" — nothing scheduled, and nothing to count down to.
      this.stopTicker();
      return;
    }
    this.startTicker();
    this.pollTimeout = setTimeout(() => {
      this.onRefresh();
      this.scheduleNext(this.intervalMs() ?? Infinity);
    }, delayMs);
  }

  private startTicker(): void {
    if (this.tickInterval) {
      return;
    }
    this.tickInterval = setInterval(() => this.tick(), 1000);
  }

  private stopTicker(): void {
    clearInterval(this.tickInterval);
    this.tickInterval = undefined;
  }

  private stop(): void {
    clearTimeout(this.pollTimeout);
    this.pollTimeout = undefined;
    this.stopTicker();
  }

  private tick(): void {
    const remainingMs = Math.max(0, this.nextRefreshAtMs - Date.now());
    this.secondsRemaining.set(Math.ceil(remainingMs / 1000));
    this.percentRemaining.set(
      this.scheduledDelayMs > 0
        ? Math.max(0, Math.min(100, (remainingMs * 100) / this.scheduledDelayMs))
        : 0,
    );
  }
}
