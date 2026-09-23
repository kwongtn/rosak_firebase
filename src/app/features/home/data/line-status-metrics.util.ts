import type { PassengerStatus } from "./home.queries";

/** The "universal metric" copy per passenger status — shared by chip hover and submission help. */
export const PASSENGER_METRIC: Record<PassengerStatus, string> = {
  NORMAL: "Seats available — you can sit.",
  BUSY: "Can board the first train — standing, but you have space.",
  CROWDED: "Standing room only — board after 1–2 trains.",
  EXTREMELY_CROWDED: "Unable to board — board after 3+ trains.",
  BACKLOGGED: "Long gap since last train — platform filling up.",
  DELAYED: "Trains running 10–15 min late.",
  DISRUPTED: "Service suspended — use an alternative route.",
};

const NO_RECENT_REPORTS = "No recent reports for this line.";

/** Universal metric copy for a passenger status, or a fallback when there are no recent reports. */
export function passengerMetric(status: PassengerStatus | null | undefined): string {
  return status ? PASSENGER_METRIC[status] : NO_RECENT_REPORTS;
}
