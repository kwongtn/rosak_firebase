import { provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { form } from "@angular/forms/signals";
import { beforeEach, describe, expect, it } from "vitest";

import {
  emptyIncidentFormModel,
  INCIDENT_TITLE_MAX_LENGTH,
  incidentFormSchema,
  type IncidentFormModel,
} from "./incident-form.schema";

function valid(): IncidentFormModel {
  return {
    ...emptyIncidentFormModel(),
    title: "KL Sentral flood",
    brief: "Platform 3 underwater",
    startDatetime: "2026-08-01T08:00",
    severity: "MAJOR",
  };
}

/** The schema applied to `model`, the way both the incident form and the console panel build it. */
function check(model: IncidentFormModel) {
  return TestBed.runInInjectionContext(() => form(signal(model), incidentFormSchema));
}

const messages = (errors: ReadonlyArray<{ message?: string }>) => errors.map((e) => e.message);

describe("incidentFormSchema", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it("accepts a complete report with no end, details or flags", () => {
    expect(check(valid())().valid()).toBe(true);
  });

  it("asks for the title, the summary, the start and the severity of an empty report", () => {
    const f = check(emptyIncidentFormModel());

    expect(f().valid()).toBe(false);
    expect(messages(f.title().errors())).toEqual(["Enter a title"]);
    expect(messages(f.brief().errors())).toEqual(["Enter a short summary"]);
    expect(messages(f.startDatetime().errors())).toEqual(["Select a start date and time"]);
    expect(messages(f.severity().errors())).toEqual(["Select a severity"]);
    // Optional fields say nothing.
    expect(f.details().errors()).toEqual([]);
    expect(f.endDatetime().errors()).toEqual([]);
  });

  it("caps the title at the backend column's 64 characters", () => {
    expect(check({ ...valid(), title: "a".repeat(INCIDENT_TITLE_MAX_LENGTH) })().valid()).toBe(
      true,
    );

    const f = check({ ...valid(), title: "a".repeat(INCIDENT_TITLE_MAX_LENGTH + 1) });

    expect(messages(f.title().errors())).toEqual(["Keep the title to 64 characters or fewer"]);
  });

  it("refuses an end before the start, on the End field", () => {
    const f = check({ ...valid(), endDatetime: "2026-08-01T07:59" });

    expect(f().valid()).toBe(false);
    expect(messages(f.endDatetime().errors())).toEqual(["End must not be before the start"]);
    expect(f.startDatetime().errors()).toEqual([]);
  });

  it("accepts an end equal to or after the start, across a day and a month", () => {
    for (const endDatetime of ["2026-08-01T08:00", "2026-08-01T08:01", "2026-09-01T00:00"]) {
      expect(check({ ...valid(), endDatetime })().valid()).toBe(true);
    }
  });

  it("compares the two datetime-local values as text, which holds only while both share the format", () => {
    // Both controls are datetime-local, so "YYYY-MM-DDTHH:mm" sorts as time. A value with seconds
    // still compares right against the same minute; a different shape would not.
    expect(check({ ...valid(), endDatetime: "2026-08-01T08:00:30" })().valid()).toBe(true);
    expect(
      check({
        ...valid(),
        startDatetime: "2026-08-01T10:00",
        endDatetime: "2026-08-01T09:59:59",
      })().valid(),
    ).toBe(false);
  });
});
