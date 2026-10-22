/** Stub data shared by the spotting specs (mock GraphQL responses for lines, vehicles and spottings). */

export const LINE = { id: "1", code: "L1", displayName: "Line 1", status: "ACTIVE" };

/** The grid's visible window is the current UTC month plus the two before it, so a day in the
 * current UTC month always lands inside it, whenever the suite runs. */
const NOW = new Date();
const YEAR = NOW.getUTCFullYear();
const MONTH = String(NOW.getUTCMonth() + 1).padStart(2, "0");
export const dayKey = (day: number): string => `${YEAR}-${MONTH}-${String(day).padStart(2, "0")}`;

export function vehicle(id: string, identificationNo: string): Record<string, unknown> {
  return {
    id,
    identificationNo,
    status: "IN_SERVICE",
    nickname: null,
    lastSpottingDate: null,
    lastSpottedAt: null,
    inServiceSince: null,
    spottingCount: 0,
    notes: null,
    incidentCount: 0,
    wheelStatus: null,
  };
}

/** `count` vehicles with ids `${idPrefix}${startIndex}…` and numbers `firstNumber…`. */
export function vehicleRange(
  startIndex: number,
  count: number,
  firstNumber: number,
  idPrefix = "",
): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, i) =>
    vehicle(`${idPrefix}${startIndex + i}`, String(firstNumber + i)),
  );
}

export function vehicleType(
  id: string,
  internalName: string,
  displayName: string,
  vehicles: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    id,
    internalName,
    displayName,
    vehicleStatusInServiceCount: vehicles.length,
    vehicleStatusNotSpottedCount: 0,
    vehicleStatusOutOfServiceCount: 0,
    vehicleStatusDecommissionedCount: 0,
    vehicleStatusMarriedCount: 0,
    vehicleStatusTestingCount: 0,
    vehicleStatusUnknownCount: 0,
    vehicleTotalCount: vehicles.length,
    vehicles,
  };
}
