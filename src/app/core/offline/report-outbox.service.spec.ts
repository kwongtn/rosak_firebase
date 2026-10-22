import { WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastService } from "../../ui/toast/toast.service";
import { AuthService } from "../auth/auth.service";
import { GraphQLRequestError } from "../graphql/graphql-client";
import { METHODOLOGY_CONSTANTS } from "../methodology/methodology.constants";
import { metricTooltip } from "../methodology/methodology-render.util";
import {
  REPORT_OUTBOX_MAX_AGE_MINUTES,
  ReportOutboxService,
  parseReportOutbox,
  type LineStatusReportPayload,
  type QueuedLineStatusReport,
  type ReportOutboxSender,
} from "./report-outbox.service";

const STORAGE_KEY = "rosak:report-outbox:v1";
const MINUTE = 60_000;

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

describe("ReportOutboxService", () => {
  let isLoggedIn: WritableSignal<boolean>;
  let user: WritableSignal<{ uid: string } | null>;
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    isLoggedIn = signal(true);
    user = signal<{ uid: string } | null>({ uid: "u1" });
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: { isLoggedIn, user, whenReady: Promise.resolve() } },
        { provide: ToastService, useValue: toast },
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

  it("queues a report with the time and the account that queued it", () => {
    const outbox = service();
    const before = Date.now();

    outbox.enqueue(payload("line-1"));

    const [entry] = stored();
    expect(entry).toMatchObject({ ...payload("line-1"), uid: "u1" });
    expect(entry.queuedAt).toBeGreaterThanOrEqual(before);
    expect(entry.queuedAt).toBeLessThanOrEqual(Date.now());
    expect(outbox.reports()).toEqual([entry]);
  });

  it("keeps one report per line, the latest", () => {
    const outbox = service();

    outbox.enqueue(payload("line-1", { status: "BUSY" }));
    outbox.enqueue(payload("line-2"));
    outbox.enqueue(payload("line-1", { status: "DISRUPTED" }));

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

  it(`drops reports older than ${REPORT_OUTBOX_MAX_AGE_MINUTES} minutes with a toast, and sends the rest`, async () => {
    store([queued("line-1", REPORT_OUTBOX_MAX_AGE_MINUTES + 1), queued("line-2", 3)]);
    const send = vi.fn<ReportOutboxSender>(async () => true);

    const sent = await service().flush(send);

    expect(sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].lineId).toBe("line-2");
    expect(toast.info).toHaveBeenCalledExactlyOnceWith(
      "Saved report expired",
      `A saved report is not sent once it is more than ${REPORT_OUTBOX_MAX_AGE_MINUTES} minutes old. Report again if it still applies.`,
    );
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "Saved report sent",
      "Thanks for keeping the community informed.",
    );
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
      throw new Error("Http failure response: 0 Unknown Error");
    });

    const sent = await service().flush(send);

    expect(sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(stored().map((entry) => entry.lineId)).toEqual(["line-1", "line-2"]);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does nothing while offline, not even expiring", async () => {
    store([queued("line-1", REPORT_OUTBOX_MAX_AGE_MINUTES + 5), queued("line-2", 1)]);
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
    store([queued("line-1", REPORT_OUTBOX_MAX_AGE_MINUTES + 1), queued("line-2", 1)]);
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
      queued("line-1", REPORT_OUTBOX_MAX_AGE_MINUTES + 1, { uid: "someone-else" }),
      queued("line-2", REPORT_OUTBOX_MAX_AGE_MINUTES + 2),
      queued("line-3", REPORT_OUTBOX_MAX_AGE_MINUTES + 3),
    ]);

    await service().flush(async () => true);

    expect(stored()).toEqual([]);
    expect(toast.info).toHaveBeenCalledExactlyOnceWith(
      "2 saved reports expired",
      expect.stringContaining(`${REPORT_OUTBOX_MAX_AGE_MINUTES} minutes`),
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
      outbox.enqueue(payload("line-1", { status: "DISRUPTED" }));
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
      { lineId: "line-2", status: "BUSY", queuedAt: 300, uid: "u1" },
      { lineId: "", status: "BUSY", queuedAt: 100 },
      { lineId: "line-3", status: "", queuedAt: 100 },
      { lineId: "line-4", status: "BUSY", queuedAt: "yesterday" },
      "not an entry",
      { lineId: "line-1", status: "BUSY", queuedAt: 200, stationIds: ["s1", 2], notes: "" },
      { lineId: "line-1", status: "CROWDED", queuedAt: 250, delayMinutes: 2.5 },
    ]);

    expect(parseReportOutbox(raw)).toEqual([
      {
        lineId: "line-1",
        status: "CROWDED",
        stationIds: [],
        delayMinutes: null,
        notes: null,
        queuedAt: 250,
        uid: null,
      },
      {
        lineId: "line-2",
        status: "BUSY",
        stationIds: [],
        delayMinutes: null,
        notes: null,
        queuedAt: 300,
        uid: "u1",
      },
    ]);
  });

  /* ---- the published rule ------------------------------------------------------------------ */

  it("publishes the expiry once, and the tooltip names that same number", () => {
    // One number, two readers: the outbox compares with it and the registry publishes it.
    expect(METHODOLOGY_CONSTANTS["REPORT_OUTBOX_MAX_AGE_MINUTES"]).toEqual({
      value: REPORT_OUTBOX_MAX_AGE_MINUTES,
      source: "LINE_STATUS_DERIVE.md",
    });
    expect(metricTooltip("line-status.queued-report-expiry")).toContain(
      `${REPORT_OUTBOX_MAX_AGE_MINUTES} minutes`,
    );
  });
});
