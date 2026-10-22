import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { form } from "@angular/forms/signals";
import { describe, expect, it } from "vitest";

import { emptyReportFormModel, reportFormSchema, type ReportFormModel } from "./report-form.schema";

/** A form over `fields` on top of a model whose line and vehicle are already picked. */
function reportForm(fields: Partial<ReportFormModel> = {}, vehicleStatus = "IN_SERVICE") {
  const model = signal<ReportFormModel>({
    ...emptyReportFormModel(),
    lineId: "4",
    vehicleId: "v1",
    ...fields,
  });
  const status = signal(vehicleStatus);
  const tree = TestBed.runInInjectionContext(() =>
    form(
      model,
      reportFormSchema(() => status()),
    ),
  );
  return { tree, model, status };
}

type Tree = ReturnType<typeof reportForm>["tree"];

/** The messages shown under one field: an error the schema targets elsewhere does not count. */
function messages(tree: Tree, field: keyof ReportFormModel): (string | undefined)[] {
  return tree[field]()
    .errors()
    .map((error) => error.message);
}

describe("reportFormSchema", () => {
  it("is valid once a line and a vehicle are picked, with the default type and status", () => {
    expect(reportForm().tree().valid()).toBe(true);
  });

  it("requires a line, a vehicle, a date, a status and a type", () => {
    const { tree } = reportForm({ lineId: "", vehicleId: "", spottingDate: "", status: "" });

    expect(messages(tree, "lineId")).toEqual(["Select a line"]);
    expect(messages(tree, "vehicleId")).toEqual(["Select a vehicle"]);
    expect(messages(tree, "spottingDate")).toEqual(["Select a date"]);
    expect(messages(tree, "status")).toEqual(["Select a status"]);
    expect(reportForm({ type: "" }).tree.type().errors()).toHaveLength(1);
  });

  describe("stations", () => {
    it("asks for both stations of a BETWEEN_STATIONS report, each under its own field", () => {
      const { tree, model } = reportForm({ type: "BETWEEN_STATIONS" });

      expect(messages(tree, "originStation")).toEqual(["Select an origin station"]);
      expect(messages(tree, "destinationStation")).toEqual(["Select a destination station"]);
      expect(tree().valid()).toBe(false);

      model.update((m) => ({ ...m, originStation: "s1" }));
      expect(messages(tree, "originStation")).toEqual([]);
      expect(messages(tree, "destinationStation")).toEqual(["Select a destination station"]);

      model.update((m) => ({ ...m, destinationStation: "s2" }));
      expect(tree().valid()).toBe(true);
    });

    it("asks for the station of an AT_STATION report under its field", () => {
      const { tree, model } = reportForm({ type: "AT_STATION" });

      expect(messages(tree, "atStation")).toEqual(["Select a station"]);

      model.update((m) => ({ ...m, atStation: "s1" }));
      expect(tree().valid()).toBe(true);
    });

    it.each(["JUST_SPOTTING", "DEPOT", "LOCATION"] as const)(
      "asks for no station for a %s report",
      (type) => {
        expect(reportForm({ type }).tree().valid()).toBe(true);
      },
    );
  });

  describe("sanity check", () => {
    it.each(["DECOMMISSIONED", "MARRIED", "OUT_OF_SERVICE", "UNKNOWN"])(
      "holds a %s vehicle back until the rider confirms it, under the checkbox",
      (status) => {
        const { tree, model } = reportForm({}, status);

        expect(messages(tree, "sanityTest")).toEqual([
          "Confirm you meant to report against this vehicle",
        ]);
        expect(tree().valid()).toBe(false);

        model.update((m) => ({ ...m, sanityTest: true }));
        expect(tree().valid()).toBe(true);
      },
    );

    it.each(["IN_SERVICE", "TESTING", "NOT_SPOTTED", ""])(
      "does not ask for a %j vehicle",
      (status) => {
        expect(reportForm({}, status).tree().valid()).toBe(true);
      },
    );

    it("follows the selected vehicle's status, which is not part of the model", () => {
      const { tree, status } = reportForm({}, "IN_SERVICE");
      expect(tree().valid()).toBe(true);

      status.set("MARRIED");
      expect(messages(tree, "sanityTest")).toHaveLength(1);

      status.set("");
      expect(tree().valid()).toBe(true);
    });
  });
});
