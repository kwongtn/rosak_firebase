import { describe, expect, it, vi } from "vitest";

import type { AuthService } from "../../../core/auth/auth.service";
import { GraphQLRequestError, type GraphQLClient } from "../../../core/graphql/graphql-client";
import type { QueuedLineStatusReport } from "../../../core/offline/report-outbox.service";
import { SUBMIT_LINE_STATUS_REPORT_MUTATION } from "./home-history.queries";
import {
  LINE_STATUS_SUBMIT_TIMEOUT_MS,
  sendQueuedLineStatusReport,
  submitLineStatusReport,
} from "./submit-line-status-report";

function fakes(token: string | null, result: unknown) {
  const request = vi.fn(async (..._args: unknown[]) => result);
  return {
    request,
    graphql: { request } as unknown as GraphQLClient,
    auth: { idToken: vi.fn(async () => token) } as unknown as AuthService,
  };
}

const INPUT = {
  lineId: "line-1",
  status: "CROWDED" as const,
  stationIds: ["s1"],
  delayMinutes: null,
  notes: null,
};

describe("submitLineStatusReport", () => {
  it("sends the input with the caller's token and a timeout, and resolves the payload's ok", async () => {
    const { graphql, auth, request } = fakes("token", {
      submitLineStatusReport: { ok: true, id: 1 },
    });

    await expect(submitLineStatusReport(graphql, auth, INPUT)).resolves.toBe(true);

    expect(request).toHaveBeenCalledExactlyOnceWith(
      SUBMIT_LINE_STATUS_REPORT_MUTATION,
      { input: INPUT },
      { "firebase-auth-key": "token" },
      { timeout: LINE_STATUS_SUBMIT_TIMEOUT_MS },
    );
    // A tunnel's dead link must turn into a queued report within a wait a rider sits through.
    expect(LINE_STATUS_SUBMIT_TIMEOUT_MS).toBe(15_000);
  });

  it("sends no auth header without a token, and reports a payload that is not ok", async () => {
    const { graphql, auth, request } = fakes(null, {
      submitLineStatusReport: { ok: false, id: null },
    });

    await expect(submitLineStatusReport(graphql, auth, INPUT)).resolves.toBe(false);

    expect(request.mock.calls[0]).toEqual([
      SUBMIT_LINE_STATUS_REPORT_MUTATION,
      { input: INPUT },
      {},
      { timeout: LINE_STATUS_SUBMIT_TIMEOUT_MS },
    ]);
  });

  it("lets a GraphQL error and a transport failure through, so the caller can tell them apart", async () => {
    const graphqlError = new GraphQLRequestError([{ message: "No such line" }]);
    const failing = (error: unknown) =>
      ({ request: vi.fn(async () => Promise.reject(error)) }) as unknown as GraphQLClient;
    const { auth } = fakes("token", null);

    await expect(submitLineStatusReport(failing(graphqlError), auth, INPUT)).rejects.toBe(
      graphqlError,
    );
    await expect(
      submitLineStatusReport(failing(new Error("offline")), auth, INPUT),
    ).rejects.toThrow("offline");
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
    const { graphql, auth, request } = fakes("token", {
      submitLineStatusReport: { ok: true, id: 1 },
    });

    await expect(sendQueuedLineStatusReport(graphql, auth, queued)).resolves.toBe(true);

    expect(request.mock.calls[0][1]).toEqual({ input: INPUT });
    // Quiet: the outbox toasts a refusal itself, so the client's own toast would be a second one.
    expect(request.mock.calls[0][3]).toEqual({
      timeout: LINE_STATUS_SUBMIT_TIMEOUT_MS,
      quiet: true,
    });
  });

  it("refuses a stored status that is not a passenger status, without a request", async () => {
    const { graphql, auth, request } = fakes("token", null);

    await expect(
      sendQueuedLineStatusReport(graphql, auth, { ...queued, status: "ON_FIRE" }),
    ).resolves.toBe(false);

    expect(request).not.toHaveBeenCalled();
  });
});
