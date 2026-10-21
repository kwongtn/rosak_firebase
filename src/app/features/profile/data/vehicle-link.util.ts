/**
 * `/spotting/:lineId/vehicle/:vehicleId`, the vehicle page. It lives under a line, so every link
 * to a vehicle needs the line id as well.
 *
 * A string rather than a command array: a template that calls this on every change-detection pass
 * hands `routerLink` a value that compares equal, where a fresh array would re-resolve the href
 * each time. Both ids are encoded, so an id with a slash can never add a path segment.
 */
export function vehiclePagePath(lineId: string, vehicleId: string): string {
  return `/spotting/${encodeURIComponent(lineId)}/vehicle/${encodeURIComponent(vehicleId)}`;
}

/**
 * The vehicle page under the vehicle's FIRST line, or `null` for a vehicle on no line (the route
 * has no line-less form, so there is nothing to link to).
 *
 * A vehicle on several lines opens under the first the API lists. Any of them reaches the same
 * vehicle, and the page does not need to know which line the rider came from.
 */
export function firstLineVehiclePath(vehicle: {
  id: string;
  lines: readonly { id: string }[];
}): string | null {
  const first = vehicle.lines.at(0);
  return first ? vehiclePagePath(first.id, vehicle.id) : null;
}
