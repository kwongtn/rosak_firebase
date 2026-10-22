import { maxLength, required, schema, validate } from "@angular/forms/signals";
import type { CalendarIncidentSeverity } from "../data/insiden.queries";

/** The backend's `CalendarIncident.title` is `CharField(max_length=64)` and its input type has no
 * length check of its own, so a longer title would only fail at the database. */
export const INCIDENT_TITLE_MAX_LENGTH = 64;

export interface IncidentFormModel {
  title: string;
  brief: string;
  details: string;
  /** datetime-local input value; "" when unset. */
  startDatetime: string;
  endDatetime: string;
  severity: CalendarIncidentSeverity | "";
  longTerm: boolean;
  inaccurate: boolean;
}

export function emptyIncidentFormModel(): IncidentFormModel {
  return {
    title: "",
    brief: "",
    details: "",
    startDatetime: "",
    endDatetime: "",
    severity: "",
    longTerm: false,
    inaccurate: false,
  };
}

export const incidentFormSchema = schema<IncidentFormModel>((f) => {
  required(f.title, { message: "Enter a title" });
  maxLength(f.title, INCIDENT_TITLE_MAX_LENGTH, {
    message: `Keep the title to ${INCIDENT_TITLE_MAX_LENGTH} characters or fewer`,
  });
  required(f.brief, { message: "Enter a short summary" });
  required(f.startDatetime, { message: "Select a start date and time" });
  required(f.severity, { message: "Select a severity" });

  // A validator on End itself, so its message shows under End: an error a validateTree returns with
  // a `field` key still lands on the form root, where no template reads it. Both values are
  // datetime-local strings, which sort as times while they share that format.
  validate(f.endDatetime, ({ value, valueOf }) => {
    const start = valueOf(f.startDatetime);
    return start && value() && value() < start
      ? { kind: "endBeforeStart", message: "End must not be before the start" }
      : undefined;
  });
});
