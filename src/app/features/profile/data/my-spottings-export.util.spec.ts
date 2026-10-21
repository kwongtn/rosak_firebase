import { describe, expect, it } from "vitest";

import { toCsv } from "../../../core/export/csv.util";
import { MY_SPOTTINGS_EXPORT_COLUMNS, buildSpottingExportRows } from "./my-spottings-export.util";
import type { MyEvent } from "./profile.queries";

function makeEvent(id: string, overrides: Partial<MyEvent> = {}): MyEvent {
  return {
    id,
    spottingDate: "2026-09-18",
    notes: null,
    created: "2026-09-18T08:00:00",
    status: "IN_SERVICE",
    type: "AT_STATION",
    runNumber: null,
    mediaCount: 0,
    isMine: true,
    originStation: null,
    destinationStation: null,
    vehicle: {
      id: "29",
      status: "IN_SERVICE",
      identificationNo: "105",
      vehicleType: { internalName: "Inspiro 4C" },
      lines: [{ id: "2", code: "MRT KGL" }],
    },
    ...overrides,
  };
}

describe("buildSpottingExportRows", () => {
  it("maps one event to the ten columns", () => {
    const [row] = buildSpottingExportRows([
      makeEvent("1", {
        spottingDate: "2026-09-22",
        notes: "Sentul Timur platform",
        runNumber: "R12",
        mediaCount: 2,
        type: "BETWEEN_STATIONS",
        status: "TESTING",
        originStation: { displayName: "Ampang" },
        destinationStation: { displayName: "Sentul Timur" },
      }),
    ]);

    expect(row).toEqual({
      date: "2026-09-22",
      vehicle: "105",
      line: "MRT KGL",
      type: "BETWEEN_STATIONS",
      status: "TESTING",
      notes: "Sentul Timur platform",
      runNumber: "R12",
      origin: "Ampang",
      destination: "Sentul Timur",
      mediaCount: 2,
    });
  });

  it("covers exactly the ten columns the header lists, in order", () => {
    const [row] = buildSpottingExportRows([makeEvent("1")]);

    expect(Object.keys(row)).toEqual([...MY_SPOTTINGS_EXPORT_COLUMNS]);
    expect(MY_SPOTTINGS_EXPORT_COLUMNS).toEqual([
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
    ]);
  });

  it("names every column as a camelCase identifier, so a JSON consumer can write row.runNumber", () => {
    for (const column of MY_SPOTTINGS_EXPORT_COLUMNS) {
      expect(column).toMatch(/^[a-z][A-Za-z]*$/);
    }
  });

  it("joins every line a vehicle is on, the way the history shows them", () => {
    const [row] = buildSpottingExportRows([
      makeEvent("1", {
        vehicle: {
          id: "81",
          status: "IN_SERVICE",
          identificationNo: "EMU01",
          vehicleType: { internalName: "EMU" },
          lines: [
            { id: "6", code: "KTMK-PKL" },
            { id: "7", code: "KTMK-SRL" },
          ],
        },
      }),
    ]);

    expect(row.line).toBe("KTMK-PKL, KTMK-SRL");
  });

  it("exports a missing value as null, an empty cell and a JSON null", () => {
    const [row] = buildSpottingExportRows([makeEvent("1", { notes: "" })]);

    expect(row.notes).toBeNull();
    expect(row.runNumber).toBeNull();
    expect(row.origin).toBeNull();
    expect(row.destination).toBeNull();
  });

  it("treats a list that did not select the stations the same as one with none", () => {
    const withoutStations = makeEvent("1");
    delete withoutStations.originStation;
    delete withoutStations.destinationStation;

    const [row] = buildSpottingExportRows([withoutStations]);

    expect(row.origin).toBeNull();
    expect(row.destination).toBeNull();
  });

  it("keeps a zero media count as 0, which is data and not an absence", () => {
    const [row] = buildSpottingExportRows([makeEvent("1", { mediaCount: 0 })]);

    expect(row.mediaCount).toBe(0);
  });

  it("keeps the order it was given", () => {
    const rows = buildSpottingExportRows([
      makeEvent("3", { spottingDate: "2026-09-03" }),
      makeEvent("1", { spottingDate: "2026-09-01" }),
      makeEvent("2", { spottingDate: "2026-09-02" }),
    ]);

    expect(rows.map((row) => row.date)).toEqual(["2026-09-03", "2026-09-01", "2026-09-02"]);
  });

  it("drops a repeated event, which paging by offset produces when the history shifts", () => {
    const rows = buildSpottingExportRows([
      makeEvent("2", { notes: "first" }),
      makeEvent("1"),
      makeEvent("1"),
      makeEvent("2", { notes: "second" }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].notes).toBe("first");
  });

  it("returns no rows for no events", () => {
    expect(buildSpottingExportRows([])).toEqual([]);
  });

  it("feeds toCsv as a header plus one line per spotting, quoting a comma in the notes", () => {
    const csv = toCsv(
      MY_SPOTTINGS_EXPORT_COLUMNS,
      buildSpottingExportRows([makeEvent("1", { notes: "Platform 2, late" })]),
    );

    expect(csv.split("\r\n")).toEqual([
      "date,vehicle,line,type,status,notes,runNumber,origin,destination,mediaCount",
      '2026-09-18,105,MRT KGL,AT_STATION,IN_SERVICE,"Platform 2, late",,,,0',
      "",
    ]);
  });
});
