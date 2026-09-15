import { required, schema, validateTree } from "@angular/forms/signals";
import type { CalendarIncidentSeverity } from "../data/insiden.queries";

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
  required(f.brief, { message: "Enter a short summary" });
  required(f.startDatetime, { message: "Select a start date and time" });
  required(f.severity, { message: "Select a severity" });

  validateTree(f, ({ value }) => {
    const model = value();
    const errors = [];

    if (model.startDatetime && model.endDatetime && model.endDatetime < model.startDatetime) {
      errors.push({
        kind: "required",
        message: "End must not be before the start",
        field: f.endDatetime,
      });
    }

    return errors;
  });
});
