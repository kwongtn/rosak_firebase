import { type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { IncidentSheetService } from "../data/incident-sheet.service";
import type { CalendarIncident } from "../data/insiden.queries";
import {
  CREATE_CALENDAR_INCIDENT_MUTATION,
  SUBMIT_CALENDAR_INCIDENT_MUTATION,
  UPDATE_CALENDAR_INCIDENT_MUTATION,
} from "../data/insiden.queries";
import {
  emptyChronology,
  moveChronology,
  removeChronology,
  type ChronologyDraft,
} from "./chronology-list.util";
import { isoToDateTimeLocal } from "./extract-data.util";
import { emptyIncidentFormModel, type IncidentFormModel } from "./incident-form.schema";
import { IncidentFormComponent } from "./incident-form.component";

interface ComponentUnderTest {
  model: WritableSignal<IncidentFormModel>;
  chronologies: WritableSignal<ChronologyDraft[]>;
  isSubmitting: WritableSignal<boolean>;
  submit(): Promise<void>;
  clear(): void;
  hydrate(incident: CalendarIncident): void;
}

function asTestable(fixture: ComponentFixture<IncidentFormComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

function filledModel(): IncidentFormModel {
  return {
    ...emptyIncidentFormModel(),
    title: "KL Sentral flood",
    brief: "Platform 3 underwater",
    startDatetime: "2026-08-01T08:00",
    severity: "MAJOR",
  };
}

function incidentFixture(overrides: Partial<CalendarIncident> = {}): CalendarIncident {
  return {
    id: "7",
    startDatetime: "2026-08-01T08:00:00Z",
    endDatetime: "2026-08-01T10:00:00Z",
    severity: "MAJOR",
    title: "KL Sentral flood",
    brief: "Platform 3 underwater",
    details: "Water over the platforms.",
    hasDetails: true,
    impactFactor: 1,
    longTerm: false,
    inaccurate: false,
    version: 3,
    lastUpdated: "2026-08-01T09:00:00Z",
    lines: [{ id: "L1", code: "KJL", displayName: "Kelana Jaya Line" }],
    vehicles: [{ id: "V1", identificationNo: "C243" }],
    stations: [{ id: "S1", displayName: "KL Sentral" }],
    categories: [{ id: "C1", name: "Just Reporting" }],
    chronologies: [
      {
        order: 2,
        indicator: "RED",
        datetime: "2026-08-01T09:30:00Z",
        content: "Clearing",
        sourceUrl: null,
      },
      {
        order: 1,
        indicator: "GREEN",
        datetime: "2026-08-01T08:00:00Z",
        content: "Started",
        sourceUrl: "https://x.com/a/1",
      },
    ],
    voteScore: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    userVote: 0,
    medias: [],
    ...overrides,
  } as CalendarIncident;
}

describe("IncidentFormComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let toastMocks: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let authMocks: { isLoggedIn: ReturnType<typeof vi.fn>; isAdmin: ReturnType<typeof vi.fn> };
  let sheet: InstanceType<typeof IncidentSheetService>;
  let fixture: ComponentFixture<IncidentFormComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ createCalendarIncident: { ok: true, id: 42 } });
    toastMocks = { success: vi.fn(), error: vi.fn() };
    authMocks = { isLoggedIn: vi.fn(() => true), isAdmin: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [IncidentFormComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { ...authMocks, idToken: async () => "token" },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: toastMocks },
      ],
    }).compileComponents();

    sheet = TestBed.inject(IncidentSheetService);
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(IncidentFormComponent);
    fixture.detectChanges();
    const referenceRequest = httpMock.expectOne((r) => r.method === "POST");
    referenceRequest.flush({
      data: { lines: [], stations: [], calendarIncidentCategories: [] },
    });
    await fixture.whenStable();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("refuses to submit for logged-out users without any GraphQL call", async () => {
    authMocks.isLoggedIn.mockReturnValue(false);
    const component = asTestable(fixture);

    await component.submit();

    expect(requestMock).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
  });

  it("blocks an empty form on validation and never reaches the network", async () => {
    const component = asTestable(fixture);

    await component.submit();

    expect(requestMock).not.toHaveBeenCalled();
    expect(component.isSubmitting()).toBe(false);
  });

  it("submits a valid draft and chains submitCalendarIncident for non-admins", async () => {
    sheet.open();
    const component = asTestable(fixture);
    component.model.set(filledModel());

    await component.submit();

    expect(requestMock).toHaveBeenCalledTimes(2);
    const [createMutation] = requestMock.mock.calls[0];
    expect(createMutation).toBe(CREATE_CALENDAR_INCIDENT_MUTATION);
    const [submitMutation, submitVars] = requestMock.mock.calls[1];
    expect(submitMutation).toBe(SUBMIT_CALENDAR_INCIDENT_MUTATION);
    expect(submitVars).toEqual({ calendarIncidentId: "42" });
    expect(toastMocks.success).toHaveBeenCalledTimes(1);
    expect(sheet.isOpen()).toBe(false);
    expect(component.model()).toEqual(emptyIncidentFormModel());
    expect(component.isSubmitting()).toBe(false);
  });

  it("skips the submit mutation for admins whose creates land LIVE", async () => {
    authMocks.isAdmin.mockReturnValue(true);
    const component = asTestable(fixture);
    component.model.set(filledModel());

    await component.submit();

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock.mock.calls[0][0]).toBe(CREATE_CALENDAR_INCIDENT_MUTATION);
  });

  it("keeps the form open when the create mutation fails", async () => {
    requestMock.mockRejectedValueOnce(new Error("backend down"));
    sheet.open();
    const component = asTestable(fixture);
    component.model.set(filledModel());

    await expect(component.submit()).rejects.toThrow("backend down");

    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(sheet.isOpen()).toBe(true);
    expect(component.isSubmitting()).toBe(false);
  });

  it("routes nested chronology edits through the pure list operations", () => {
    const component = asTestable(fixture);

    component.chronologies.update((list) => [...list, emptyChronology(0)]);
    component.chronologies.update((list) => [...list, emptyChronology(1)]);
    expect(component.chronologies().map((c) => c.key)).toEqual([0, 1]);

    component.chronologies.update((list) => moveChronology(list, 1, 0));
    expect(component.chronologies().map((c) => c.key)).toEqual([1, 0]);

    component.chronologies.update((list) => removeChronology(list, 1));
    expect(component.chronologies().map((c) => c.key)).toEqual([0]);
  });

  it("hydrates the full form state from an incident row", () => {
    const component = asTestable(fixture);
    component.hydrate(incidentFixture());

    expect(component.model()).toEqual({
      title: "KL Sentral flood",
      brief: "Platform 3 underwater",
      details: "Water over the platforms.",
      startDatetime: isoToDateTimeLocal("2026-08-01T08:00:00Z"),
      endDatetime: isoToDateTimeLocal("2026-08-01T10:00:00Z"),
      severity: "MAJOR",
      longTerm: false,
      inaccurate: false,
    });
    expect(component.chronologies().map((c) => c.content)).toEqual(["Started", "Clearing"]);
    expect(component.chronologies().map((c) => c.key)).toEqual([0, 1]);
    // Second hydration continues the local key sequence — no @for key collisions.
    component.hydrate(incidentFixture({ id: "8" }));
    expect(component.chronologies().map((c) => c.key)).toEqual([2, 3]);
  });

  it("hydrates automatically when the sheet opens with an edit target", async () => {
    const component = asTestable(fixture);
    sheet.open(incidentFixture());
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.model().title).toBe("KL Sentral flood");
    expect(component.chronologies().length).toBe(2);
  });

  it("submits an edit through the update mutation with version and the full payload", async () => {
    requestMock.mockResolvedValueOnce({ updateCalendarIncident: { ok: true, id: null } });
    sheet.open(incidentFixture());
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);

    await component.submit();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(UPDATE_CALENDAR_INCIDENT_MUTATION);
    expect(vars.calendarIncidentId).toBe("7");
    expect(vars.input.version).toBe(3);
    expect(vars.input.impactFactor).toBe(1);
    expect(vars.input.categoryIds).toEqual(["C1"]);
    expect(vars.input.lineIds).toEqual(["L1"]);
    expect(vars.input.vehicleIds).toEqual(["V1"]);
    expect(vars.input.stationIds).toEqual(["S1"]);
    expect(vars.input.chronologies).toEqual([
      {
        indicator: "GREEN",
        datetime: "2026-08-01T08:00:00.000Z",
        sourceUrl: "https://x.com/a/1",
        content: "Started",
      },
      {
        indicator: "RED",
        datetime: "2026-08-01T09:30:00.000Z",
        sourceUrl: null,
        content: "Clearing",
      },
    ]);
    expect(vars.input.chronologies[0]).not.toHaveProperty("order");
    // id: null means an in-place save (no DRAFT revision created) — no submit chain.
    const mutationsSent = requestMock.mock.calls.map((call) => call[0]);
    expect(mutationsSent).not.toContain(SUBMIT_CALENDAR_INCIDENT_MUTATION);
    expect(toastMocks.success).toHaveBeenCalledWith("Incident updated", "Your changes were saved.");
    expect(sheet.isOpen()).toBe(false);
    expect(component.model()).toEqual(emptyIncidentFormModel());
    expect(component.isSubmitting()).toBe(false);
  });

  it("chains submitCalendarIncident when the edit returns a revision id", async () => {
    requestMock.mockResolvedValueOnce({ updateCalendarIncident: { ok: true, id: "11" } });
    sheet.open(incidentFixture());
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);

    await component.submit();

    expect(requestMock).toHaveBeenCalledTimes(2);
    const [updateMutation] = requestMock.mock.calls[0];
    expect(updateMutation).toBe(UPDATE_CALENDAR_INCIDENT_MUTATION);
    const [submitMutation, submitVars] = requestMock.mock.calls[1];
    expect(submitMutation).toBe(SUBMIT_CALENDAR_INCIDENT_MUTATION);
    expect(submitVars).toEqual({ calendarIncidentId: "11" });
    expect(toastMocks.success).toHaveBeenCalledWith(
      "Incident updated",
      "Your changes were submitted for approval.",
    );
    expect(sheet.isOpen()).toBe(false);
    expect(component.model()).toEqual(emptyIncidentFormModel());
    expect(component.isSubmitting()).toBe(false);
  });

  it("does not chain submitCalendarIncident for an in-place edit (id null)", async () => {
    requestMock.mockResolvedValueOnce({ updateCalendarIncident: { ok: true, id: null } });
    sheet.open(incidentFixture());
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);

    await component.submit();

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock.mock.calls[0][0]).toBe(UPDATE_CALENDAR_INCIDENT_MUTATION);
    expect(toastMocks.success).toHaveBeenCalledWith("Incident updated", "Your changes were saved.");
    expect(sheet.isOpen()).toBe(false);
    expect(component.isSubmitting()).toBe(false);
  });

  it("surfaces a chained-submit rejection verbatim and keeps the sheet open with the form intact", async () => {
    const submitMessage = "This revision is already pending approval.";
    requestMock
      .mockResolvedValueOnce({ updateCalendarIncident: { ok: true, id: "11" } })
      .mockRejectedValueOnce(new GraphQLRequestError([{ message: submitMessage }]));
    sheet.open(incidentFixture());
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);
    component.model.update((m) => ({ ...m, title: "Edited title" }));

    await component.submit();

    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(toastMocks.error).toHaveBeenCalledWith("Couldn't save changes", submitMessage);
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(sheet.isOpen()).toBe(true);
    expect(component.model().title).toBe("Edited title");
    expect(component.isSubmitting()).toBe(false);
  });

  it("surfaces the backend rejection verbatim and keeps the sheet open with the form intact", async () => {
    const conflictMessage =
      "An unapproved edit draft already exists for this incident. Please allow the draft to approve before proceeding.";
    requestMock.mockRejectedValueOnce(new GraphQLRequestError([{ message: conflictMessage }]));
    sheet.open(incidentFixture());
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);
    component.model.update((m) => ({ ...m, title: "Edited title" }));

    await component.submit();

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(toastMocks.error).toHaveBeenCalledWith("Couldn't save changes", conflictMessage);
    expect(sheet.isOpen()).toBe(true);
    expect(component.model().title).toBe("Edited title");
    expect(component.isSubmitting()).toBe(false);
  });

  it("surfaces the version-mismatch conflict verbatim too", async () => {
    requestMock.mockRejectedValueOnce(
      new GraphQLRequestError([
        { message: "Version mismatch: client has v3, server is at v4; reload and retry." },
      ]),
    );
    sheet.open(incidentFixture());
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);

    await component.submit();

    expect(toastMocks.error).toHaveBeenCalledWith(
      "Couldn't save changes",
      "Version mismatch: client has v3, server is at v4; reload and retry.",
    );
    expect(sheet.isOpen()).toBe(true);
  });

  it("omits the OCC version when the hydrated row carries none", async () => {
    requestMock.mockResolvedValueOnce({ updateCalendarIncident: { ok: true, id: null } });
    sheet.open(incidentFixture({ version: undefined }));
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);

    await component.submit();

    const [, vars] = requestMock.mock.calls[0];
    expect(vars.input.version).toBeNull();
  });

  it("resets the edit target on clear so no stale hydration survives", () => {
    const component = asTestable(fixture);
    sheet.open(incidentFixture());
    fixture.detectChanges();
    expect(sheet.editTarget()).not.toBeNull();

    component.clear();

    expect(sheet.editTarget()).toBeNull();
    expect(component.model()).toEqual(emptyIncidentFormModel());
    expect(component.chronologies()).toEqual([]);
  });
});
