import { describe, expect, it, vi } from "vitest";

import { GraphQLRequestError, type GraphQLClient } from "../../../core/graphql/graphql-client";
import type { QueuedLineStatusReport } from "../../../core/offline/report-outbox.service";
import { SUBMIT_LINE_STATUS_REPORT_MUTATION } from "./home-history.queries";
import {
  LINE_STATUS_SUBMIT_TIMEOUT_MS,
  sendQueuedLineStatusReport,
  submitLineStatusReport,
} from "./submit-line-status-report";

function fakes(result: unknown) {
  const request = vi.fn(async (..._args: unknown[]) => result);
  return { request, graphql: { request } as unknown as GraphQLClient };
}

const INPUT = {
  lineId: "line-1",
  status: "CROWDED" as const,
  stationIds: ["s1"],
  delayMinutes: null,
  notes: null,
};

describe("submitLineStatusReport", () => {
  it("sends the input with a timeout, and resolves the payload's ok", async () => {
    const { graphql, request } = fakes({ submitLineStatusReport: { ok: true, id: 1 } });

    await expect(submitLineStatusReport(graphql, INPUT)).resolves.toBe(true);

    // No headers: the auth interceptor signs it (core/http/auth.interceptor.spec.ts).
    expect(request).toHaveBeenCalledExactlyOnceWith(
      SUBMIT_LINE_STATUS_REPORT_MUTATION,
      { input: INPUT },
      undefined,
      { timeout: LINE_STATUS_SUBMIT_TIMEOUT_MS },
    );
    // A tunnel's dead link must turn into a queued report within a wait a rider sits through.
    expect(LINE_STATUS_SUBMIT_TIMEOUT_MS).toBe(15_000);
  });

  it("reports a payload that is not ok", async () => {
    const { graphql } = fakes({ submitLineStatusReport: { ok: false, id: null } });

    await expect(submitLineStatusReport(graphql, INPUT)).resolves.toBe(false);
  });

  it("lets a GraphQL error and a transport failure through, so the caller can tell them apart", async () => {
    const graphqlError = new GraphQLRequestError([{ message: "No such line" }]);
    const failing = (error: unknown) =>
      ({ request: vi.fn(async () => Promise.reject(error)) }) as unknown as GraphQLClient;

    await expect(submitLineStatusReport(failing(graphqlError), INPUT)).rejects.toBe(graphqlError);
    await expect(submitLineStatusReport(failing(new Error("offline")), INPUT)).rejects.toThrow(
      "offline",
    );
  });
});

describe("sendQueuedLineStatusReport", () => {
  const queued: QueuedLineStatusReport = {
    ...INPUT,
    queuedAt: 1,
    statusWindowMinutes: 15,
    uid: "u1",
  };

  it("sends a queued report as the mutation's input, without the outbox's bookkeeping", async () => {
    const { graphql, request } = fakes({ submitLineStatusReport: { ok: true, id: 1 } });

    await expect(sendQueuedLineStatusReport(graphql, queued)).resolves.toBe(true);

    expect(request.mock.calls[0][1]).toEqual({ input: INPUT });
    // Quiet: the outbox toasts a refusal itself, so the client's own toast would be a second one.
    expect(request.mock.calls[0][3]).toEqual({
      timeout: LINE_STATUS_SUBMIT_TIMEOUT_MS,
      quiet: true,
    });
  });

  it("refuses a stored status that is not a passenger status, without a request", async () => {
    const { graphql, request } = fakes(null);

    await expect(
      sendQueuedLineStatusReport(graphql, { ...queued, status: "ON_FIRE" }),
    ).resolves.toBe(false);

    expect(request).not.toHaveBeenCalled();
  });
});
