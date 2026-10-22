import { HttpErrorResponse } from "@angular/common/http";
import { ErrorHandler, Injectable, inject, signal } from "@angular/core";

import { ToastService } from "../../ui/toast/toast.service";
import { AuthService } from "../auth/auth.service";
import { injectIsBrowser } from "../composables/is-browser";
import { GraphQLRequestError } from "../graphql/graphql-client";
import { OnlineService } from "../network/online.service";
import { readStorageItem, removeStorageItem, writeStorageItem } from "../util/web-storage.util";

/**
 * How long a queued line status report may wait before it is dropped instead of sent. The backend
 * stamps a report when it ARRIVES (there is no client-supplied time), so a report sent late counts
 * as fresh on the board; capping the wait at the backend's 15-minute status window bounds how
 * stale a counted report can be. Published as the `line-status.queued-report-expiry` metric through
 * `METHODOLOGY_CONSTANTS.REPORT_OUTBOX_MAX_AGE_MINUTES`; the spec pins the two together.
 */
export const REPORT_OUTBOX_MAX_AGE_MINUTES = 15;

const MAX_AGE_MS = REPORT_OUTBOX_MAX_AGE_MINUTES * 60_000;

/**
 * `localStorage`, not `sessionStorage` and not IndexedDB. The outbox has to survive the tab being
 * closed or killed by the OS, which `sessionStorage` does not, and it holds at most one small entry
 * per line, which needs no database. `core/upload/upload-queue-db.ts` is hard-wired to one store of
 * photo records, so reusing it would have meant a schema upgrade for a handful of rows.
 */
const STORAGE_KEY = "rosak:report-outbox:v1";

/** Web Locks name: two tabs that reconnect at the same moment send each report once. */
const LOCK_NAME = "rosak:report-outbox";

/** A line status report waiting for a connection: the mutation input plus its bookkeeping. */
export interface QueuedLineStatusReport {
  lineId: string;
  /** A `PassengerStatus`. `core/` does not import the feature's enum; the sender checks it. */
  status: string;
  stationIds: string[];
  delayMinutes: number | null;
  notes: string | null;
  /** `Date.now()` when the rider pressed Submit. */
  queuedAt: number;
  /**
   * The Firebase uid that queued it. Only that account sends it, so a report queued before a
   * sign-out cannot go out under the next account. `null` only where there is no Firebase user,
   * as under the e2e auth override.
   */
  uid: string | null;
}

/** What the line-status sheet hands over: the report without the outbox's bookkeeping. */
export type LineStatusReportPayload = Omit<QueuedLineStatusReport, "queuedAt" | "uid">;

/**
 * Sends one queued report through the same code path as the sheet's Submit. Resolves the payload's
 * `ok`. Rejects with `GraphQLRequestError` when the server answered with errors, and with anything
 * else when it did not; {@link isRetryableSendFailure} tells which of those are worth a retry.
 */
export type ReportOutboxSender = (report: QueuedLineStatusReport) => Promise<boolean>;

/** Gateway answers for a backend that is down or restarting behind nginx: try again later. */
const RETRYABLE_HTTP_STATUSES: readonly number[] = [502, 503, 504];

/**
 * True when a send failed because the report did not get through, so it is worth keeping for a
 * later try: no connection or a dead link (`HttpErrorResponse` status 0, which is also what a
 * request timeout gives), a gateway in front of a backend that is down (502, 503, 504), or an ID
 * token refresh that could not reach Firebase. Anything else is an answer that sending the same
 * report again will not change: a `GraphQLRequestError`, any other 4xx or 5xx, a client error.
 * The sheet and the flush both decide with it, so a report is queued exactly when it is kept.
 */
export function isRetryableSendFailure(err: unknown): boolean {
  if (err instanceof HttpErrorResponse) {
    return err.status === 0 || RETRYABLE_HTTP_STATUSES.includes(err.status);
  }
  return err instanceof Error && "code" in err && err.code === "auth/network-request-failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toQueuedReport(value: unknown): QueuedLineStatusReport | null {
  if (!isRecord(value)) {
    return null;
  }
  const lineId = value["lineId"];
  const status = value["status"];
  const queuedAt = value["queuedAt"];
  if (
    typeof lineId !== "string" ||
    lineId === "" ||
    typeof status !== "string" ||
    status === "" ||
    typeof queuedAt !== "number" ||
    !Number.isFinite(queuedAt)
  ) {
    return null;
  }
  const stationIds = value["stationIds"];
  const delayMinutes = value["delayMinutes"];
  const notes = value["notes"];
  const uid = value["uid"];
  return {
    lineId,
    status,
    stationIds: Array.isArray(stationIds)
      ? stationIds.filter((id): id is string => typeof id === "string" && id !== "")
      : [],
    delayMinutes:
      typeof delayMinutes === "number" && Number.isInteger(delayMinutes) ? delayMinutes : null,
    notes: typeof notes === "string" && notes !== "" ? notes : null,
    queuedAt,
    uid: typeof uid === "string" && uid !== "" ? uid : null,
  };
}

/**
 * The stored outbox, oldest first. Unknown or malformed storage reads as empty, an unreadable entry
 * is dropped, and two entries for one line (only possible if storage was edited) keep the newer.
 * Never throws.
 */
export function parseReportOutbox(raw: string | null | undefined): QueuedLineStatusReport[] {
  if (typeof raw !== "string" || raw === "") {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const byLine = new Map<string, QueuedLineStatusReport>();
  for (const value of parsed) {
    const report = toQueuedReport(value);
    const held = report ? byLine.get(report.lineId) : undefined;
    if (report && (held === undefined || held.queuedAt < report.queuedAt)) {
      byLine.set(report.lineId, report);
    }
  }
  return [...byLine.values()].sort((a, b) => a.queuedAt - b.queuedAt);
}

/**
 * The offline outbox for line status reports (audit F211). When the line-status sheet cannot
 * reach the server, it hands the report here instead of showing an error; `flush()` sends what is
 * waiting once there is a connection again.
 *
 * The service owns storage, expiry and the send loop, and nothing else: it registers no trigger
 * of its own. The home route registers the flush (`features/home/data/report-outbox-flush.ts`), so
 * this file and Firebase Auth stay in the lazy front-page chunk, and the board the flush refreshes
 * is the one that route owns. `core/` cannot import the feature's mutation, so the caller passes
 * the sender.
 */
@Injectable({ providedIn: "root" })
export class ReportOutboxService {
  private readonly auth = inject(AuthService);
  private readonly online = inject(OnlineService);
  private readonly toast = inject(ToastService);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly isBrowser = injectIsBrowser();

  /** A mirror of storage for the UI. Storage stays the source of truth: every change re-reads it. */
  private readonly _reports = signal<QueuedLineStatusReport[]>(this.load());
  readonly reports = this._reports.asReadonly();

  private _flushing = false;

  /** True when the signed-in account has a report for this line waiting. Reactive. */
  hasQueued(lineId: string): boolean {
    const uid = this.currentUid();
    return this._reports().some((report) => report.lineId === lineId && report.uid === uid);
  }

  /** Queues a report. One entry per line: a newer report for the same line replaces the older. */
  enqueue(report: LineStatusReportPayload): void {
    if (!this.isBrowser) {
      return;
    }
    const entry: QueuedLineStatusReport = {
      lineId: report.lineId,
      status: report.status,
      stationIds: [...report.stationIds],
      delayMinutes: report.delayMinutes,
      notes: report.notes,
      queuedAt: Date.now(),
      uid: this.currentUid(),
    };
    this.save([...this.load().filter((queued) => queued.lineId !== report.lineId), entry]);
  }

  /**
   * Sends what is waiting, oldest first, and resolves how many went through. A no-op while offline
   * and while a flush is already running. Entries older than {@link REPORT_OUTBOX_MAX_AGE_MINUTES}
   * are dropped with a toast first. Then, for the signed-in account only: a failure that
   * {@link isRetryableSendFailure} accepts keeps the entry and everything after it for the next
   * try; any other answer (a `GraphQLRequestError`, a payload that is not `ok`, another HTTP error)
   * drops the entry and toasts why.
   */
  async flush(send: ReportOutboxSender): Promise<number> {
    // The empty check keeps a flush on every board beat down to one storage read.
    if (!this.isBrowser || this.load().length === 0) {
      return 0;
    }
    // Firebase restores a session asynchronously: without this, an app-start flush would read
    // "logged out" and keep everything, or send without a token and lose it to the permission error.
    // Awaited before the busy flag and the Web Lock, so a session that is slow to restore holds up
    // this call only, never this tab's next flush or another tab's.
    await this.auth.whenReady;
    if (!this.online.isOnline() || this._flushing) {
      return 0;
    }
    this._flushing = true;
    try {
      // `navigator.locks` is missing in older browsers and in jsdom, whatever lib.dom says.
      const locks = navigator.locks as LockManager | undefined;
      return locks
        ? await locks.request(LOCK_NAME, () => this.sendQueued(send))
        : await this.sendQueued(send);
    } finally {
      this._flushing = false;
    }
  }

  private async sendQueued(send: ReportOutboxSender): Promise<number> {
    const now = Date.now();
    const uid = this.currentUid();
    // Re-read inside the lock: another tab may have sent or replaced entries meanwhile.
    const queued = this.load();
    const fresh = queued.filter((report) => now - report.queuedAt <= MAX_AGE_MS);
    if (fresh.length < queued.length) {
      this.save(fresh);
      // Told only to the account that queued it: on a shared device, the next person signed in
      // has no business learning that someone else had a report waiting.
      const expired = queued.filter((report) => !fresh.includes(report) && report.uid === uid);
      if (expired.length > 0) {
        this.toast.info(
          expired.length === 1 ? "Saved report expired" : `${expired.length} saved reports expired`,
          `A saved report is not sent once it is more than ${REPORT_OUTBOX_MAX_AGE_MINUTES} minutes old. Report again if it still applies.`,
        );
      }
    }
    if (!this.auth.isLoggedIn()) {
      return 0;
    }
    let sent = 0;
    for (const report of fresh) {
      if (report.uid !== uid) {
        // Another account's report waits for that account, or expires.
        continue;
      }
      if (!this.online.isOnline()) {
        break;
      }
      try {
        const ok = await send(report);
        this.remove(report);
        if (ok) {
          sent += 1;
        } else {
          this.toast.error(
            "Saved report not sent",
            "The server didn't save it. Report again if it still applies.",
          );
        }
      } catch (err) {
        if (isRetryableSendFailure(err)) {
          // The connection is not really back. Keep this report and the rest for the next try,
          // which is the whole point of the outbox. Not rethrown: a dead link is the case the outbox
          // exists for, and a submit that queued after a failure already sent that failure to Sentry.
          break;
        }
        // An answer that sending again will not change: drop the report and say why.
        this.remove(report);
        if (err instanceof GraphQLRequestError) {
          // `GraphQLClient` has already reported it to Sentry.
          this.toast.error("Saved report not sent", err.message);
        } else {
          this.toast.error(
            "Saved report not sent",
            "The server didn't save it. Report again if it still applies.",
          );
          this.errorHandler.handleError(err);
        }
      }
    }
    if (sent > 0) {
      this.toast.success(
        sent === 1 ? "Saved report sent" : `${sent} saved reports sent`,
        "Thanks for keeping the community informed.",
      );
    }
    return sent;
  }

  /** Removes exactly this entry: a newer one for the same line, queued during its send, stays. */
  private remove(report: QueuedLineStatusReport): void {
    this.save(
      this.load().filter(
        (queued) => !(queued.lineId === report.lineId && queued.queuedAt === report.queuedAt),
      ),
    );
  }

  private currentUid(): string | null {
    return this.auth.user()?.uid ?? null;
  }

  private load(): QueuedLineStatusReport[] {
    return this.isBrowser ? parseReportOutbox(readStorageItem("local", STORAGE_KEY)) : [];
  }

  private save(reports: QueuedLineStatusReport[]): void {
    if (reports.length === 0) {
      removeStorageItem("local", STORAGE_KEY);
    } else {
      writeStorageItem("local", STORAGE_KEY, JSON.stringify(reports));
    }
    this._reports.set(reports);
  }
}
