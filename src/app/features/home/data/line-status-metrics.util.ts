import { metricDoc } from "../../../core/methodology/methodology-render.util";
import type { PassengerStatus } from "./home.queries";

/** The "universal metric" copy per passenger status — shared by chip hover and submission help. */
export const PASSENGER_METRIC: Record<PassengerStatus, string> = {
  NORMAL: metricDoc("passenger.normal").definition,
  BUSY: metricDoc("passenger.busy").definition,
  CROWDED: metricDoc("passenger.crowded").definition,
  EXTREMELY_CROWDED: metricDoc("passenger.extremely_crowded").definition,
  BACKLOGGED: metricDoc("passenger.backlogged").definition,
  DELAYED: metricDoc("passenger.delayed").definition,
  DISRUPTED: metricDoc("passenger.disrupted").definition,
};

const NO_RECENT_REPORTS = "No recent reports for this line.";

/** Universal metric copy for a passenger status, or a fallback when there are no recent reports. */
export function passengerMetric(status: PassengerStatus | null | undefined): string {
  return status ? PASSENGER_METRIC[status] : NO_RECENT_REPORTS;
}
