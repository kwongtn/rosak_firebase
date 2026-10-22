import { WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { OnlineService } from "../../../core/network/online.service";
import {
  ReportOutboxService,
  type QueuedLineStatusReport,
  type ReportOutboxSender,
} from "../../../core/offline/report-outbox.service";
import { SUBMIT_LINE_STATUS_REPORT_MUTATION } from "./home-history.queries";
import { HomeStore } from "./home.store";
import { provideReportOutboxFlush } from "./report-outbox-flush";

describe("provideReportOutboxFlush", () => {
  let flush: ReturnType<typeof vi.fn<(send: ReportOutboxSender) => Promise<number>>>;
  let store: { linesRefreshTick: WritableSignal<number>; reloadAll: ReturnType<typeof vi.fn> };
  let request: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    flush = vi.fn(async () => 0);
    store = { linesRefreshTick: signal(0), reloadAll: vi.fn() };
    request = vi.fn(async () => ({ submitLineStatusReport: { ok: true, id: 7 } }));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideReportOutboxFlush(),
        { provide: ReportOutboxService, useValue: { flush } },
        { provide: HomeStore, useValue: store },
        { provide: GraphQLClient, useValue: { request } },
        { provide: AuthService, useValue: { idToken: async () => "fresh-token" } },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  /** Creates the injector (which runs the initializer) and lets its effect run. */
  function start(): void {
    TestBed.inject(OnlineService);
    TestBed.tick();
  }

  it("flushes once when the route starts online", () => {
    start();

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does not flush while offline, and flushes as soon as the browser is back online", () => {
    start();
    flush.mockClear();

    window.dispatchEvent(new Event("offline"));
    TestBed.tick();
    expect(flush).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("online"));
    TestBed.tick();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("tries again on every board beat, because a dead link can still look online", () => {
    start();
    flush.mockClear();

    store.linesRefreshTick.update((tick) => tick + 1);
    TestBed.tick();

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("reloads the board after a flush that sent something, and not after one that sent nothing", async () => {
    flush.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    start();
    await vi.waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(store.reloadAll).not.toHaveBeenCalled();

    store.linesRefreshTick.update((tick) => tick + 1);
    TestBed.tick();

    await vi.waitFor(() => expect(store.reloadAll).toHaveBeenCalledTimes(1));
  });

  it("sends through the sheet's own path, with a token read at send time", async () => {
    start();
    const send = flush.mock.calls[0][0];
    const report: QueuedLineStatusReport = {
      lineId: "line-1",
      status: "DELAYED",
      stationIds: ["s1"],
      delayMinutes: 5,
      notes: "Held at KL Sentral",
      queuedAt: Date.now(),
      uid: "u1",
    };

    await expect(send(report)).resolves.toBe(true);

    expect(request).toHaveBeenCalledExactlyOnceWith(
      SUBMIT_LINE_STATUS_REPORT_MUTATION,
      {
        input: {
          lineId: "line-1",
          status: "DELAYED",
          stationIds: ["s1"],
          delayMinutes: 5,
          notes: "Held at KL Sentral",
        },
      },
      { "firebase-auth-key": "fresh-token" },
    );
  });
});
