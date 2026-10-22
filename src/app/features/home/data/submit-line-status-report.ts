import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
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
 * The ONE send path for a line status report, shared by the line-status sheet's Submit and the
 * outbox flush (`report-outbox-flush.ts`). The Firebase ID token is read at send time, so a report
 * that waited in the outbox goes out with a fresh one. No reCAPTCHA: `submitLineStatusReport` only
 * checks `IsLoggedIn`.
 *
 * Resolves the payload's `ok`. Rejects with `GraphQLRequestError` when the server answered with
 * errors (`GraphQLClient` has already toasted it), and with anything else when the request did not
 * complete, a failed token refresh included.
 */
export async function submitLineStatusReport(
  graphql: GraphQLClient,
  auth: AuthService,
  input: LineStatusReportInput,
): Promise<boolean> {
  const idToken = await auth.idToken();
  const data = await graphql.request<SubmitLineStatusReportData, SubmitLineStatusReportVars>(
    SUBMIT_LINE_STATUS_REPORT_MUTATION,
    { input },
    idToken ? { "firebase-auth-key": idToken } : {},
  );
  return data.submitLineStatusReport.ok;
}

/**
 * A queued report back into the mutation's input, then the same send path. The outbox stores the
 * status as a plain string (`core/` does not know the enum), so one that is not a `PassengerStatus`
 * (only possible if storage was edited) is refused here as not `ok`, without a request.
 */
export function sendQueuedLineStatusReport(
  graphql: GraphQLClient,
  auth: AuthService,
  report: QueuedLineStatusReport,
): Promise<boolean> {
  if (!(PASSENGER_STATUSES as readonly string[]).includes(report.status)) {
    return Promise.resolve(false);
  }
  return submitLineStatusReport(graphql, auth, {
    lineId: report.lineId,
    status: report.status as PassengerStatus,
    stationIds: report.stationIds,
    delayMinutes: report.delayMinutes,
    notes: report.notes,
  });
}
