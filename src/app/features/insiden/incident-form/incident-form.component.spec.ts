import { type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { IncidentSheetService } from "../data/incident-sheet.service";
import {
  CREATE_CALENDAR_INCIDENT_MUTATION,
  SUBMIT_CALENDAR_INCIDENT_MUTATION,
} from "../data/insiden.queries";
import {
  emptyChronology,
  moveChronology,
  removeChronology,
  type ChronologyDraft,
} from "./chronology-list.util";
import { emptyIncidentFormModel, type IncidentFormModel } from "./incident-form.schema";
import { IncidentFormComponent } from "./incident-form.component";

interface ComponentUnderTest {
  model: WritableSignal<IncidentFormModel>;
  chronologies: WritableSignal<ChronologyDraft[]>;
  isSubmitting: WritableSignal<boolean>;
  submit(): Promise<void>;
  clear(): void;
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
});
