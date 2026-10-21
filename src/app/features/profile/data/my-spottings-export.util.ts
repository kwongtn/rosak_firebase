import { vehicleLinesLabel } from "../../../core/util/lines-label.util";
import type { MyEvent } from "./profile.queries";

/** The file name both formats share, with `.csv` or `.json` appended. */
export const MY_SPOTTINGS_EXPORT_BASENAME = "mlptf-my-spottings";

/**
 * One exported spotting. The property names are the CSV header and the JSON keys alike, so the two
 * downloads carry the same rows. They are camelCase, as the Pro dashboard's CSV header is: a JSON
 * key with a space needs bracket access in every consumer. A "no value" is `null`, which is an empty
 * CSV cell and a JSON null.
 *
 * `type` and `status` are the API's own enum values (`AT_STATION`, `IN_SERVICE`), not the labels the
 * page shows: an export is for reading elsewhere, and a stable code survives a relabel.
 */
export type SpottingExportRow = {
  date: string;
  vehicle: string;
  line: string;
  type: string;
  status: string;
  notes: string | null;
  runNumber: string | null;
  origin: string | null;
  destination: string | null;
  mediaCount: number;
};

/** The CSV header, in column order. Checked against {@link SpottingExportRow} by the compiler. */
export const MY_SPOTTINGS_EXPORT_COLUMNS = [
  "date",
  "vehicle",
  "line",
  "type",
  "status",
  "notes",
  "runNumber",
  "origin",
  "destination",
  "mediaCount",
] as const satisfies readonly (keyof SpottingExportRow)[];

/**
 * The rows to export, in the order given (the history's own `created DESC`, so the file reads like
 * the screen).
 *
 * An event whose id has already appeared is dropped. The history is paged by offset, so a spotting
 * logged in another tab while the export pages shifts every later page by one and repeats a row, and
 * a repeated row in an export is a lie about how many spottings there are.
 *
 * `line` joins every line the vehicle is on, as the page does. An empty `notes` becomes `null`, since
 * the API sends an empty string for no notes.
 */
export function buildSpottingExportRows(events: readonly MyEvent[]): SpottingExportRow[] {
  const unique = new Map<string, MyEvent>();
  for (const event of events) {
    if (!unique.has(event.id)) {
      unique.set(event.id, event);
    }
  }
  return [...unique.values()].map((event) => ({
    date: event.spottingDate,
    vehicle: event.vehicle.identificationNo,
    line: vehicleLinesLabel(event.vehicle),
    type: event.type,
    status: event.status,
    notes: event.notes || null,
    runNumber: event.runNumber,
    origin: event.originStation?.displayName ?? null,
    destination: event.destinationStation?.displayName ?? null,
    mediaCount: event.mediaCount,
  }));
}
