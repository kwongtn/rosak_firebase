import { required, schema, validateTree } from "@angular/forms/signals";
import { SpottingType } from "../../../core/graphql/types";

/** Vehicle statuses that may not normally be spottable: reporting one needs `sanityTest`. */
export const ABNORMAL_VEHICLE_STATUSES: ReadonlySet<string> = new Set([
  "DECOMMISSIONED",
  "MARRIED",
  "OUT_OF_SERVICE",
  "UNKNOWN",
]);

export interface ReportFormModel {
  lineId: string;
  vehicleId: string;
  spottingDate: string;
  status: string;
  type: SpottingType | "";
  atStation: string;
  originStation: string;
  destinationStation: string;
  wheelStatus: string;
  runNumber: string;
  notes: string;
  isAnonymous: boolean;
  sanityTest: boolean;
}

export function emptyReportFormModel(): ReportFormModel {
  return {
    lineId: "",
    vehicleId: "",
    spottingDate: new Date().toISOString().slice(0, 10),
    status: "IN_SERVICE",
    type: "JUST_SPOTTING",
    atStation: "",
    originStation: "",
    destinationStation: "",
    wheelStatus: "",
    runNumber: "",
    notes: "",
    isAnonymous: false,
    sanityTest: false,
  };
}

/**
 * Ported 1:1 from spotting-form.utils.ts's three cross-field validators (between-stations/
 * at-station station requirements, the abnormal-status sanity-test gate) — same rules, declared
 * as a Signal Forms schema instead of Reactive Forms validator functions bound in the component.
 *
 * `selectedVehicleStatus` is the selected vehicle's current status ("" for none), derived by the
 * component from the vehicle list rather than stored in the model, since no rider edits it. It is
 * read inside the validator, so a signal getter keeps the gate reactive.
 */
export const reportFormSchema = (selectedVehicleStatus: () => string) =>
  schema<ReportFormModel>((f) => {
    required(f.lineId, { message: "Select a line" });
    required(f.vehicleId, { message: "Select a vehicle" });
    required(f.spottingDate, { message: "Select a date" });
    required(f.status, { message: "Select a status" });
    required(f.type, { message: "Select a spotting type" });

    validateTree(f, ({ value }) => {
      const model = value();
      const errors = [];

      if (model.type === "BETWEEN_STATIONS") {
        if (!model.originStation) {
          errors.push({
            kind: "required",
            message: "Select an origin station",
            field: f.originStation,
          });
        }
        if (!model.destinationStation) {
          errors.push({
            kind: "required",
            message: "Select a destination station",
            field: f.destinationStation,
          });
        }
      }

      if (model.type === "AT_STATION" && !model.atStation) {
        errors.push({
          kind: "required",
          message: "Select a station",
          field: f.atStation,
        });
      }

      if (ABNORMAL_VEHICLE_STATUSES.has(selectedVehicleStatus()) && !model.sanityTest) {
        errors.push({
          kind: "required",
          message: "Confirm you meant to report against this vehicle",
          field: f.sanityTest,
        });
      }

      return errors;
    });
  });
