import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, type GraphQLRequestOptions } from "../../../core/graphql/graphql-client";
import type { QueuedLineStatusReport } from "../../../core/offline/report-outbox.service";
import { PASSENGER_STATUSES } from "./board-lines.util";
import {
  SUBMIT_LINE_STATUS_REPORT_MUTATION,
  type LineStatusReportInput,
  type SubmitLineStatusReportData,
  type SubmitLineStatusReportVars,
} from "./home-history.queries";
import type { PassengerStatus } from "./home.queries";

/**
 * How long one status report may take to send before it counts as a transport failure. In a tunnel
 * `navigator.onLine` stays `true` and the browser can take minutes to give up on a link that
 * carries nothing; with this the sheet queues the report instead of spinning, and a background flush
 * releases the outbox's Web Lock. The ID token read before it has its own bound: Firebase Auth fails
 * a token refresh with `auth/network-request-failed` after 30 s.
 */
export const LINE_STATUS_SUBMIT_TIMEOUT_MS = 15_000;

/**
 * The ONE send path for a line status report, shared by the line-status sheet's Submit and the
 * outbox flush (`report-outbox-flush.ts`). The Firebase ID token is read at send time, so a report
 * that waited in the outbox goes out with a fresh one. No reCAPTCHA: `submitLineStatusReport` only
 * checks `IsLoggedIn`.
 *
 * Resolves the payload's `ok`. Rejects with `GraphQLRequestError` when the server answered with
 * errors (`GraphQLClient` has already toasted it, unless `quiet`), and with anything else when the
 * request did not complete (a failed token refresh, or {@link LINE_STATUS_SUBMIT_TIMEOUT_MS}
 * passing, included). `quiet` is for the background flush, which toasts with its own words.
 */
export async function submitLineStatusReport(
  graphql: GraphQLClient,
  auth: AuthService,
  input: LineStatusReportInput,
  options: Pick<GraphQLRequestOptions, "quiet"> = {},
): Promise<boolean> {
  const idToken = await auth.idToken();
  const data = await graphql.request<SubmitLineStatusReportData, SubmitLineStatusReportVars>(
    SUBMIT_LINE_STATUS_REPORT_MUTATION,
    { input },
    idToken ? { "firebase-auth-key": idToken } : {},
    { timeout: LINE_STATUS_SUBMIT_TIMEOUT_MS, ...options },
  );
  return data.submitLineStatusReport.ok;
}

/**
 * A queued report back into the mutation's input, then the same send path, quietly: the outbox
 * toasts a refusal itself ("Saved report not sent"), so the client's own toast would say it twice.
 * The outbox stores the status as a plain string (`core/` does not know the enum), so one that is
 * not a `PassengerStatus` (only possible if storage was edited) is refused here as not `ok`,
 * without a request.
 */
export function sendQueuedLineStatusReport(
  graphql: GraphQLClient,
  auth: AuthService,
  report: QueuedLineStatusReport,
): Promise<boolean> {
  if (!(PASSENGER_STATUSES as readonly string[]).includes(report.status)) {
    return Promise.resolve(false);
  }
  return submitLineStatusReport(
    graphql,
    auth,
    {
      lineId: report.lineId,
      status: report.status as PassengerStatus,
      stationIds: report.stationIds,
      delayMinutes: report.delayMinutes,
      notes: report.notes,
    },
    { quiet: true },
  );
}
