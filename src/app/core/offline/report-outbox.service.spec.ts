import { HttpErrorResponse } from "@angular/common/http";
import {
  ErrorHandler,
  WritableSignal,
  provideZonelessChangeDetection,
  signal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastService } from "../../ui/toast/toast.service";
import { AuthService } from "../auth/auth.service";
import { GraphQLRequestError } from "../graphql/graphql-client";
import { METHODOLOGY_CONSTANTS } from "../methodology/methodology.constants";
import { metricDoc, renderMethodologyCopy } from "../methodology/methodology-render.util";
import {
  REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES,
  ReportOutboxService,
  isRetryableSendFailure,
  parseReportOutbox,
  type LineStatusReportPayload,
  type QueuedLineStatusReport,
  type ReportOutboxSender,
} from "./report-outbox.service";

const STORAGE_KEY = "rosak:report-outbox:v1";
const MINUTE = 60_000;
/** The window the fixtures' lines report in: the backend's, as the board would hand it over. */
const WINDOW = 15;

function payload(lineId: string, overrides: Partial<LineStatusReportPayload> = {}) {
  return {
    lineId,
    status: "DELAYED",
    stationIds: ["s1"],
    delayMinutes: 10,
    notes: "Held at the platform",
    ...overrides,
  } satisfies LineStatusReportPayload;
}

/** A stored entry `ageMinutes` old, built from the same clock the expiry reads (MISTAKES.md). */
function queued(
  lineId: string,
  ageMinutes: number,
  overrides: Partial<QueuedLineStatusReport> = {},
): QueuedLineStatusReport {
  return {
    ...payload(lineId),
    queuedAt: Date.now() - ageMinutes * MINUTE,
    statusWindowMinutes: WINDOW,
    uid: "u1",
    ...overrides,
  };
}

function store(reports: QueuedLineStatusReport[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

function stored(): QueuedLineStatusReport[] {
  return parseReportOutbox(localStorage.getItem(STORAGE_KEY));
}

/** What `HttpClient` rejects with when the request does not complete, or when it times out. */
function droppedConnection(): HttpErrorResponse {
  return new HttpErrorResponse({ status: 0, statusText: "Unknown Error" });
}

function timedOut(): HttpErrorResponse {
  return new HttpErrorResponse({ error: new DOMException("signal timed out", "TimeoutError") });
}

describe("ReportOutboxService", () => {
  let isLoggedIn: WritableSignal<boolean>;
  let user: WritableSignal<{ uid: string } | null>;
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let handleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    isLoggedIn = signal(true);
    user = signal<{ uid: string } | null>({ uid: "u1" });
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    handleError = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: { isLoggedIn, user, whenReady: Promise.resolve() } },
        { provide: ToastService, useValue: toast },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    Reflect.deleteProperty(navigator, "locks");
    vi.restoreAllMocks();
  });

  function service(): ReportOutboxService {
    return TestBed.inject(ReportOutboxService);
  }

  function goOffline(): void {
    window.dispatchEvent(new Event("offline"));
  }

  /* ---- enqueue ---------------------------------------------------------------------------- */

  it("queues a report with the time, its line's window and the account that queued it", () => {
    const outbox = service();
    const before = Date.now();

    outbox.enqueue(payload("line-1"), 30);

    const [entry] = stored();
    expect(entry).toMatchObject({ ...payload("line-1"), statusWindowMinutes: 30, uid: "u1" });
    expect(entry.queuedAt).toBeGreaterThanOrEqual(before);
    expect(entry.queuedAt).toBeLessThanOrEqual(Date.now());
    expect(outbox.reports()).toEqual([entry]);
  });

  it("queues with the fallback window when the page did not know the line's", () => {
    service().enqueue(payload("line-1"), null);

    expect(stored()[0].statusWindowMinutes).toBe(REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES);
  });

  it("keeps one report per line, the latest", () => {
    const outbox = service();

    outbox.enqueue(payload("line-1", { status: "BUSY" }), WINDOW);
    outbox.enqueue(payload("line-2"), WINDOW);
    outbox.enqueue(payload("line-1", { status: "DISRUPTED" }), WINDOW);

    expect(stored().map((entry) => [entry.lineId, entry.status])).toEqual([
      ["line-2", "DELAYED"],
      ["line-1", "DISRUPTED"],
    ]);
  });

  it("says whether this account has a report waiting for a line", () => {
    store([queued("line-1", 1), queued("line-2", 1, { uid: "someone-else" })]);
    const outbox = service();

    expect(outbox.hasQueued("line-1")).toBe(true);
    expect(outbox.hasQueued("line-2")).toBe(false);
    expect(outbox.hasQueued("line-3")).toBe(false);
  });

  /* ---- flush ------------------------------------------------------------------------------ */

  it("sends what is waiting, oldest first, and empties the outbox", async () => {
    store([queued("line-2", 2), queued("line-1", 5), queued("line-3", 1)]);
    const order: string[] = [];
    const send = vi.fn<ReportOutboxSender>(async (report) => {
      order.push(report.lineId);
      return true;
    });

    const sent = await service().flush(send);

    expect(sent).toBe(3);
    expect(order).toEqual(["line-1", "line-2", "line-3"]);
    expect(send.mock.calls[0][0]).toMatchObject(payload("line-1"));
    expect(stored()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(service().reports()).toEqual([]);
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "3 saved reports sent",
      "Thanks for keeping the community informed.",
    );
  });

  it("drops reports older than their line's window with a toast, and sends the rest", async () => {
    store([queued("line-1", WINDOW + 1), queued("line-2", 3)]);
    const send = vi.fn<ReportOutboxSender>(async () => true);

    const sent = await service().flush(send);

    expect(sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].lineId).toBe("line-2");
    expect(toast.info).toHaveBeenCalledExactlyOnceWith(
      "Saved report expired",
      "A saved report is not sent once it is older than its line's reporting window. Report again if it still applies.",
    );
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "Saved report sent",
      "Thanks for keeping the community informed.",
    );
  });

  it("expires each report against its own line's window, not one number for all", async () => {
    store([
      queued("line-1", 20, { statusWindowMinutes: 30 }),
      queued("line-2", 20, { statusWindowMinutes: 15 }),
    ]);
    const send = vi.fn<ReportOutboxSender>(async () => true);

    await service().flush(send);

    expect(send.mock.calls.map(([report]) => report.lineId)).toEqual(["line-1"]);
    expect(toast.info).toHaveBeenCalledExactlyOnceWith("Saved report expired", expect.any(String));
  });

  it("drops a report the server refuses, toasts the server's message, and goes on", async () => {
    store([queued("line-1", 3), queued("line-2", 2)]);
    const send = vi.fn<ReportOutboxSender>(async (report) => {
      if (report.lineId === "line-1") {
        throw new GraphQLRequestError([{ message: "Line 1 does not exist." }]);
      }
      return true;
    });

    const sent = await service().flush(send);

    expect(sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(stored()).toEqual([]);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Saved report not sent",
      "Line 1 does not exist.",
    );
  });

  it("drops a report whose payload is not ok, and says so", async () => {
    store([queued("line-1", 3)]);

    const sent = await service().flush(async () => false);

    expect(sent).toBe(0);
    expect(stored()).toEqual([]);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Saved report not sent",
      "The server didn't save it. Report again if it still applies.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps a report, and every one after it, when the connection is not really back", async () => {
    store([queued("line-1", 3), queued("line-2", 2)]);
    const send = vi.fn<ReportOutboxSender>(async () => {
      throw droppedConnection();
    });

    const sent = await service().flush(send);

    expect(sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(stored().map((entry) => entry.lineId)).toEqual(["line-1", "line-2"]);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(handleError).not.toHaveBeenCalled();
  });

  it("keeps a report whose send timed out, and lets the next beat try again", async () => {
    const request = vi.fn((_name: string, callback: () => Promise<number>) => callback());
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    store([queued("line-1", 3)]);
    const send = vi
      .fn<ReportOutboxSender>()
      .mockRejectedValueOnce(timedOut())
      .mockResolvedValueOnce(true);
    const outbox = service();

    expect(await outbox.flush(send)).toBe(0);
    expect(stored()).toHaveLength(1);

    // The lock was released and the busy flag cleared, so the next beat sends it.
    expect(await outbox.flush(send)).toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(stored()).toEqual([]);
  });

  it("drops a report the server refused with another HTTP error, says so, reports it, and goes on", async () => {
    store([queued("line-1", 3), queued("line-2", 2)]);
    const refusal = new HttpErrorResponse({ status: 400, statusText: "Bad Request" });
    const send = vi.fn<ReportOutboxSender>(async (report) => {
      if (report.lineId === "line-1") {
        throw refusal;
      }
      return true;
    });

    const sent = await service().flush(send);

    expect(sent).toBe(1);
    expect(stored()).toEqual([]);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Saved report not sent",
      "The server didn't save it. Report again if it still applies.",
    );
    expect(handleError).toHaveBeenCalledExactlyOnceWith(refusal);
  });

  it("does nothing while offline, not even expiring", async () => {
    store([queued("line-1", WINDOW + 5), queued("line-2", 1)]);
    const outbox = service();
    goOffline();
    const send = vi.fn<ReportOutboxSender>(async () => true);

    const sent = await outbox.flush(send);

    expect(sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(stored()).toHaveLength(2);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("sends nothing while logged out, keeping fresh reports and still dropping expired ones", async () => {
    isLoggedIn.set(false);
    user.set(null);
    store([queued("line-1", WINDOW + 1), queued("line-2", 1)]);
    const send = vi.fn<ReportOutboxSender>(async () => true);

    const sent = await service().flush(send);

    expect(sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(stored().map((entry) => entry.lineId)).toEqual(["line-2"]);
    // The expired report was u1's, and nobody is signed in to be told about it.
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("tells only the account that queued a report that it expired", async () => {
    store([
      queued("line-1", WINDOW + 1, { uid: "someone-else" }),
      queued("line-2", WINDOW + 2),
      queued("line-3", WINDOW + 3),
    ]);

    await service().flush(async () => true);

    expect(stored()).toEqual([]);
    expect(toast.info).toHaveBeenCalledExactlyOnceWith(
      "2 saved reports expired",
      expect.stringContaining("older than its line's reporting window"),
    );
  });

  it("sends only the signed-in account's reports", async () => {
    store([queued("line-1", 2, { uid: "someone-else" }), queued("line-2", 1)]);
    const send = vi.fn<ReportOutboxSender>(async () => true);

    await service().flush(send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].lineId).toBe("line-2");
    expect(stored().map((entry) => entry.uid)).toEqual(["someone-else"]);
  });

  it("runs one flush at a time", async () => {
    store([queued("line-1", 1)]);
    let release!: (ok: boolean) => void;
    const send = vi.fn<ReportOutboxSender>(
      () => new Promise<boolean>((resolve) => (release = resolve)),
    );
    const outbox = service();

    const first = outbox.flush(send);
    const second = await outbox.flush(send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    release(true);

    expect(second).toBe(0);
    expect(await first).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps a newer report for the same line that was queued while the older one was sending", async () => {
    store([queued("line-1", 4, { status: "BUSY" })]);
    const outbox = service();
    const send = vi.fn<ReportOutboxSender>(async () => {
      outbox.enqueue(payload("line-1", { status: "DISRUPTED" }), WINDOW);
      return true;
    });

    await outbox.flush(send);

    expect(stored().map((entry) => entry.status)).toEqual(["DISRUPTED"]);
    expect(outbox.hasQueued("line-1")).toBe(true);
  });

  it("holds the Web Lock while it sends, so two tabs cannot send one report twice", async () => {
    const request = vi.fn((_name: string, callback: () => Promise<number>) => callback());
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    store([queued("line-1", 1)]);

    const sent = await service().flush(async () => true);

    expect(request).toHaveBeenCalledExactlyOnceWith("rosak:report-outbox", expect.any(Function));
    expect(sent).toBe(1);
  });

  it("waits for the session outside the Web Lock, so a restore that never ends blocks no other tab", async () => {
    const request = vi.fn((_name: string, callback: () => Promise<number>) => callback());
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    TestBed.overrideProvider(AuthService, {
      useValue: { isLoggedIn, user, whenReady: new Promise<void>(() => undefined) },
    });
    store([queued("line-1", 1)]);
    const send = vi.fn<ReportOutboxSender>(async () => true);

    void service().flush(send);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(request).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(stored()).toHaveLength(1);
  });

  /* ---- which failures are worth a retry ------------------------------------------------------ */

  it.each([
    ["a dropped connection (status 0)", droppedConnection()],
    ["a request timeout", timedOut()],
    ["a 502", new HttpErrorResponse({ status: 502, statusText: "Bad Gateway" })],
    ["a 503", new HttpErrorResponse({ status: 503, statusText: "Service Unavailable" })],
    ["a 504", new HttpErrorResponse({ status: 504, statusText: "Gateway Timeout" })],
    [
      "a token refresh that could not reach Firebase",
      Object.assign(new Error("Firebase: Error (auth/network-request-failed)."), {
        code: "auth/network-request-failed",
      }),
    ],
  ])("retries %s", (_label, err) => {
    expect(isRetryableSendFailure(err)).toBe(true);
  });

  it.each([
    ["a GraphQL error", new GraphQLRequestError([{ message: "No such line" }])],
    ["a 400", new HttpErrorResponse({ status: 400, statusText: "Bad Request" })],
    ["a 403", new HttpErrorResponse({ status: 403, statusText: "Forbidden" })],
    ["a 413", new HttpErrorResponse({ status: 413, statusText: "Payload Too Large" })],
    ["a 500", new HttpErrorResponse({ status: 500, statusText: "Internal Server Error" })],
    [
      "another Firebase error",
      Object.assign(new Error("Firebase: Error (auth/user-disabled)."), {
        code: "auth/user-disabled",
      }),
    ],
    ["a plain error", new Error("boom")],
    ["something that is not an error", "offline"],
  ])("does not retry %s", (_label, err) => {
    expect(isRetryableSendFailure(err)).toBe(false);
  });

  /* ---- the stored shape ------------------------------------------------------------------- */

  it.each([
    ["nothing stored", null],
    ["an empty string", ""],
    ["text that is not JSON", "[{"],
    ["a JSON object", '{"lineId":"line-1"}'],
    ["JSON null", "null"],
  ])("reads %s as an empty outbox, without throwing", (_label, raw) => {
    expect(parseReportOutbox(raw)).toEqual([]);
  });

  it("drops unreadable entries, keeps the newer of two for one line, and sorts oldest first", () => {
    const raw = JSON.stringify([
      { lineId: "line-2", status: "BUSY", queuedAt: 300, uid: "u1", statusWindowMinutes: 30 },
      { lineId: "", status: "BUSY", queuedAt: 100 },
      { lineId: "line-3", status: "", queuedAt: 100 },
      { lineId: "line-4", status: "BUSY", queuedAt: "yesterday" },
      "not an entry",
      { lineId: "line-1", status: "BUSY", queuedAt: 200, stationIds: ["s1", 2], notes: "" },
      {
        lineId: "line-1",
        status: "CROWDED",
        queuedAt: 250,
        delayMinutes: 2.5,
        statusWindowMinutes: 0,
      },
    ]);

    expect(parseReportOutbox(raw)).toEqual([
      {
        lineId: "line-1",
        status: "CROWDED",
        stationIds: [],
        delayMinutes: null,
        notes: null,
        queuedAt: 250,
        // A window that is missing or unusable reads as the fallback.
        statusWindowMinutes: REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES,
        uid: null,
      },
      {
        lineId: "line-2",
        status: "BUSY",
        stationIds: [],
        delayMinutes: null,
        notes: null,
        queuedAt: 300,
        statusWindowMinutes: 30,
        uid: "u1",
      },
    ]);
  });

  /* ---- the published rule ------------------------------------------------------------------ */

  it("publishes the fallback window once, and the rule's definition names that same number", () => {
    // One number, two readers: the outbox falls back to it and the registry publishes it.
    expect(METHODOLOGY_CONSTANTS["REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES"]).toEqual({
      value: REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES,
      source: "LINE_STATUS_DERIVE.md",
    });
    expect(
      renderMethodologyCopy(metricDoc("line-status.queued-report-expiry").definition),
    ).toContain(`${REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES} minutes if the page did not know`);
  });
});
