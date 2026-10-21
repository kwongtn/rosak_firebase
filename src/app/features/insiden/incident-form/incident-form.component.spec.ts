import { type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { IncidentAiService, type ExtractedIncidentData } from "../data/incident-ai.service";
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
import {
  emptyIncidentFormModel,
  INCIDENT_TITLE_MAX_LENGTH,
  type IncidentFormModel,
} from "./incident-form.schema";
import { IncidentFormComponent } from "./incident-form.component";

interface ComponentUnderTest {
  model: WritableSignal<IncidentFormModel>;
  chronologies: WritableSignal<ChronologyDraft[]>;
  selectedLineIds: WritableSignal<string[]>;
  selectedStationIds: WritableSignal<string[]>;
  referenceResource: { reload(): void };
  isSubmitting: WritableSignal<boolean>;
  submit(): Promise<void>;
  clear(): void;
  undoAll(): void;
  hydrate(incident: CalendarIncident): void;
  extractChronology(key: number): Promise<void>;
  replaceWithExtraction(key: number): void;
  undoExtraction(key: number): void;
  isExtracting(key: number): boolean;
  hasLateResult(key: number): boolean;
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
  let extractMock: ReturnType<typeof vi.fn>;
  let toastMocks: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let authMocks: { isLoggedIn: ReturnType<typeof vi.fn>; isAdmin: ReturnType<typeof vi.fn> };
  let sheet: InstanceType<typeof IncidentSheetService>;
  let fixture: ComponentFixture<IncidentFormComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ createCalendarIncident: { ok: true, id: 42 } });
    extractMock = vi.fn();
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
        { provide: IncidentAiService, useValue: { extract: extractMock } },
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

  describe("title length", () => {
    it("refuses a title longer than the backend column and says why", async () => {
      sheet.open();
      const component = asTestable(fixture);
      component.model.set({
        ...filledModel(),
        title: "a".repeat(INCIDENT_TITLE_MAX_LENGTH + 1),
      });
      fixture.detectChanges();

      await component.submit();
      fixture.detectChanges();

      expect(requestMock).not.toHaveBeenCalled();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        `Keep the title to ${INCIDENT_TITLE_MAX_LENGTH} characters or fewer`,
      );
    });

    it("accepts a title of exactly the limit", async () => {
      sheet.open();
      const component = asTestable(fixture);
      component.model.set({ ...filledModel(), title: "a".repeat(INCIDENT_TITLE_MAX_LENGTH) });

      await component.submit();

      expect(requestMock.mock.calls[0][0]).toBe(CREATE_CALENDAR_INCIDENT_MUTATION);
    });
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

  it("toasts and rethrows when the create fails for a non-GraphQL reason (offline, 5xx)", async () => {
    // Only a GraphQLRequestError is toasted (by GraphQLClient). A dropped tunnel or a 502 reaches
    // the catch as an HttpErrorResponse and used to leave a re-enabled button and no message.
    const outage = new HttpErrorResponse({ status: 502, statusText: "Bad Gateway" });
    requestMock.mockRejectedValueOnce(outage);
    sheet.open();
    const component = asTestable(fixture);
    component.model.set(filledModel());

    await expect(component.submit()).rejects.toBe(outage);

    expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(
      "Couldn't submit",
      "Check your connection and try again.",
    );
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

  it("undoes all edits by re-hydrating from the edit target", async () => {
    sheet.open(incidentFixture());
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);
    component.model.update((m) => ({ ...m, title: "Edited title", brief: "Edited brief" }));
    component.chronologies.update((list) => [...list, emptyChronology(99)]);

    component.undoAll();

    expect(sheet.editTarget()).not.toBeNull();
    expect(component.model().title).toBe("KL Sentral flood");
    expect(component.model().brief).toBe("Platform 3 underwater");
    expect(component.chronologies().map((c) => c.content)).toEqual(["Started", "Clearing"]);
  });

  it("falls back to clearing when undoAll runs outside an edit session", () => {
    const component = asTestable(fixture);
    component.model.set(filledModel());

    component.undoAll();

    expect(component.model()).toEqual(emptyIncidentFormModel());
  });

  describe("Extract Data", () => {
    const EXTRACTED: ExtractedIncidentData = {
      title: "Signal fault",
      datetime: "2026-08-01T09:30:00+08:00",
      content: "Trains held at KL Sentral",
      source_url: "https://x.com/a/1",
      indicator: "disruption",
      severity: "major",
      affected_lines: [],
      affected_stations: [],
    };

    /** The sheet only renders its body once it has been opened, so open it before reading the DOM. */
    async function seedRow(): Promise<void> {
      sheet.open();
      asTestable(fixture).chronologies.set([
        { ...emptyChronology(0), sourceUrl: "https://x.com/a/1", content: "typed by hand" },
      ]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    /** The five controls Fill from link locks while it runs: indicator, datetime, URL, content, button. */
    function rowControls(): Array<
      HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
    > {
      const row = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="chronology-row"]',
      );
      if (!row) throw new Error("chronology row not rendered");
      const extractButton = Array.from(row.querySelectorAll("button")).find((button) =>
        /Fill from link|Filling/.test(button.textContent ?? ""),
      );
      if (!extractButton) throw new Error("Fill from link button not rendered");
      return [
        ...row.querySelectorAll<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>(
          "select, input[type='datetime-local'], input[type='url'], textarea",
        ),
        extractButton,
      ];
    }

    function deferredExtraction(): { resolve: (value: unknown) => void } {
      let resolve!: (value: unknown) => void;
      extractMock.mockReturnValueOnce(new Promise((done) => (resolve = done)));
      return { resolve };
    }

    it("locks the row while extracting, then unlocks it and applies the result", async () => {
      const component = asTestable(fixture);
      await seedRow();
      const extraction = deferredExtraction();

      const request = component.extractChronology(0);
      fixture.detectChanges();
      expect(component.isExtracting(0)).toBe(true);
      expect(rowControls().map((control) => control.disabled)).toEqual([
        true,
        true,
        true,
        true,
        true,
      ]);

      extraction.resolve({ requestId: "r1", data: EXTRACTED });
      await request;
      fixture.detectChanges();

      // The reported bug: the flag was never cleared on this path, so the spinner stayed and the
      // rider could neither correct the extracted text nor extract again.
      expect(component.isExtracting(0)).toBe(false);
      expect(component.chronologies()[0].content).toBe(EXTRACTED.content);
      expect(rowControls().map((control) => control.disabled)).toEqual([
        false,
        false,
        false,
        false,
        false,
      ]);
      expect(extractMock).toHaveBeenCalledWith("https://x.com/a/1", expect.any(String));
    });

    it("unlocks the row and keeps what was typed when the extraction returns nothing", async () => {
      const component = asTestable(fixture);
      await seedRow();
      extractMock.mockResolvedValueOnce(null);

      await component.extractChronology(0);
      fixture.detectChanges();

      expect(component.isExtracting(0)).toBe(false);
      expect(component.chronologies()[0].content).toBe("typed by hand");
      expect(rowControls().every((control) => !control.disabled)).toBe(true);
    });

    it("keeps a result that misses the 15s cap for the Replace box instead of applying it", async () => {
      const component = asTestable(fixture);
      await seedRow();
      const extraction = deferredExtraction();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        const request = component.extractChronology(0);
        await vi.advanceTimersByTimeAsync(15_000);

        // The timeout releases the row on its own and tells the rider to fill it in by hand.
        expect(component.isExtracting(0)).toBe(false);
        expect(toastMocks.error).toHaveBeenCalledWith(
          "Data extraction failed",
          "Please fill in manually.",
        );

        extraction.resolve({ requestId: "r1", data: EXTRACTED });
        await request;

        expect(component.hasLateResult(0)).toBe(true);
        expect(component.isExtracting(0)).toBe(false);
        expect(component.chronologies()[0].content).toBe("typed by hand");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("Fill from link", () => {
    const REFERENCE = {
      lines: [
        { id: "4", code: "LRT KJL", displayName: "LRT Kelana Jaya Line", vehicleTypes: [] },
        { id: "1", code: "MRL", displayName: "KL Monorail Line", vehicleTypes: [] },
      ],
      stations: [
        { id: "10", displayName: "KL Sentral", lines: [{ id: "4", code: "LRT KJL" }] },
        { id: "11", displayName: "Pasar Seni", lines: [{ id: "4", code: "LRT KJL" }] },
      ],
      calendarIncidentCategories: [],
    };

    const FILLED: ExtractedIncidentData = {
      title: "Signal fault at KL Sentral",
      datetime: "2026-08-01T09:30:00+08:00",
      content: "Trains held at KL Sentral",
      source_url: "https://x.com/a/1",
      indicator: "disruption",
      severity: "major",
      affected_lines: ["LRT KJL", "Bogus Line"],
      affected_stations: ["kl sentral", "Nowhere"],
    };

    const host = () => fixture.nativeElement as HTMLElement;

    const chipTexts = () =>
      Array.from(host().querySelectorAll('[data-testid="fill-chip"]')).map((chip) =>
        chip.textContent?.trim(),
      );

    const unmatchedText = () =>
      host().querySelector('[data-testid="fill-unmatched"]')?.textContent?.trim() ?? null;

    /** Swaps the empty reference data the suite starts with for lines and stations to match against. */
    async function loadReference(): Promise<void> {
      asTestable(fixture).referenceResource.reload();
      fixture.detectChanges();
      httpMock.expectOne((request) => request.method === "POST").flush({ data: REFERENCE });
      await fixture.whenStable();
    }

    /** Opens the sheet (the body only renders once open) on one row holding just a source URL. */
    async function openWithRow(row: Partial<ChronologyDraft> = {}): Promise<ComponentUnderTest> {
      sheet.open();
      const component = asTestable(fixture);
      component.chronologies.set([
        { ...emptyChronology(0), sourceUrl: "https://x.com/a/1", ...row },
      ]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return component;
    }

    async function fillFromLink(
      component: ComponentUnderTest,
      data: ExtractedIncidentData = FILLED,
    ): Promise<void> {
      extractMock.mockResolvedValueOnce({ requestId: "r1", data });
      await component.extractChronology(0);
      fixture.detectChanges();
    }

    it("fills the empty title, severity, lines and stations and says so", async () => {
      await loadReference();
      const component = await openWithRow();

      await fillFromLink(component);

      expect(component.model().title).toBe("Signal fault at KL Sentral");
      expect(component.model().severity).toBe("MAJOR");
      expect(component.selectedLineIds()).toEqual(["4"]);
      expect(component.selectedStationIds()).toEqual(["10"]);
      expect(toastMocks.success).toHaveBeenCalledWith(
        "Filled from link",
        "Filled in title, severity, 1 line, 1 station. Review before you submit.",
      );
    });

    it("shows the matched lines and stations as chips and lists the rest as unmatched", async () => {
      await loadReference();
      const component = await openWithRow();

      await fillFromLink(component);

      expect(chipTexts()).toEqual(["LRT KJL", "KL Sentral"]);
      expect(unmatchedText()).toBe("Couldn't match: Bogus Line, Nowhere");
    });

    it("takes the row's datetime, content and a blank row's indicator", async () => {
      await loadReference();
      const component = await openWithRow();

      await fillFromLink(component);

      expect(component.chronologies()[0]).toMatchObject({
        indicator: "RED",
        content: "Trains held at KL Sentral",
        datetime: isoToDateTimeLocal("2026-08-01T09:30:00+08:00"),
      });
    });

    it("never overwrites a typed title, a chosen severity or already selected lines and stations", async () => {
      await loadReference();
      const component = await openWithRow();
      component.model.update((m) => ({ ...m, title: "My own title", severity: "MINOR" }));
      component.selectedLineIds.set(["1"]);
      component.selectedStationIds.set(["11"]);

      await fillFromLink(component);

      expect(component.model().title).toBe("My own title");
      expect(component.model().severity).toBe("MINOR");
      expect(component.selectedLineIds()).toEqual(["1"]);
      expect(component.selectedStationIds()).toEqual(["11"]);
      expect(host().querySelector('[data-testid="fill-summary"]')).toBeNull();
      expect(toastMocks.success).not.toHaveBeenCalled();
    });

    it("keeps an indicator the rider picked and the indicator of a row that already has text", async () => {
      await loadReference();
      const picked = await openWithRow({ indicator: "BLUE" });
      await fillFromLink(picked);
      expect(picked.chronologies()[0].indicator).toBe("BLUE");

      const typed = await openWithRow({ content: "typed by hand" });
      await fillFromLink(typed);
      expect(typed.chronologies()[0].indicator).toBe("GREEN");
    });

    it("unselects a line or station when its chip is dismissed, leaving the other chips", async () => {
      await loadReference();
      const component = await openWithRow();
      await fillFromLink(component);

      const dismiss = (label: string) => {
        const remove = host().querySelector<HTMLButtonElement>(
          `button[aria-label="Remove ${label}"]`,
        );
        if (!remove) throw new Error(`remove button for ${label} not rendered`);
        remove.click();
        fixture.detectChanges();
      };

      dismiss("LRT KJL");
      expect(component.selectedLineIds()).toEqual([]);
      expect(component.selectedStationIds()).toEqual(["10"]);
      expect(chipTexts()).toEqual(["KL Sentral"]);

      dismiss("KL Sentral");
      expect(component.selectedStationIds()).toEqual([]);
      expect(chipTexts()).toEqual([]);
      // The names that matched nothing stay listed: only the rider can place them.
      expect(unmatchedText()).toBe("Couldn't match: Bogus Line, Nowhere");
    });

    it("drops a chip when its line is unselected some other way", async () => {
      await loadReference();
      const component = await openWithRow();
      await fillFromLink(component);

      component.selectedStationIds.set([]);
      fixture.detectChanges();

      expect(chipTexts()).toEqual(["LRT KJL"]);
    });

    it("matches a line or station the model names without its operator prefix or 'Station' suffix", async () => {
      await loadReference();
      const component = await openWithRow();

      await fillFromLink(component, {
        ...FILLED,
        affected_lines: ["Kelana Jaya Line"],
        affected_stations: ["Pasar Seni Station"],
      });

      expect(component.selectedLineIds()).toEqual(["4"]);
      expect(component.selectedStationIds()).toEqual(["11"]);
      expect(chipTexts()).toEqual(["LRT KJL", "Pasar Seni"]);
      expect(unmatchedText()).toBeNull();
    });

    it("cuts a title longer than the backend allows, so the form can still be submitted", async () => {
      await loadReference();
      const component = await openWithRow();

      await fillFromLink(component, {
        ...FILLED,
        title:
          "Signal fault disrupts LRT Kelana Jaya Line services between KL Sentral and Pasar Seni",
      });

      expect(component.model().title).toBe(
        "Signal fault disrupts LRT Kelana Jaya Line services between KL",
      );
      expect(component.model().title.length).toBeLessThanOrEqual(INCIDENT_TITLE_MAX_LENGTH);
    });

    it("reports names that match nothing even when no chip could be made", async () => {
      await loadReference();
      const component = await openWithRow();

      await fillFromLink(component, {
        ...FILLED,
        affected_lines: ["Kelana Jaya Extension"],
        affected_stations: [],
      });

      expect(component.selectedLineIds()).toEqual([]);
      expect(chipTexts()).toEqual([]);
      expect(unmatchedText()).toBe("Couldn't match: Kelana Jaya Extension");
    });

    it("clears the chips and the unmatched note with the form", async () => {
      await loadReference();
      const component = await openWithRow();
      await fillFromLink(component);
      expect(host().querySelector('[data-testid="fill-summary"]')).not.toBeNull();

      component.clear();
      fixture.detectChanges();

      expect(host().querySelector('[data-testid="fill-summary"]')).toBeNull();
    });

    it("forgets the unmatched note when another incident is loaded for editing", async () => {
      await loadReference();
      const component = await openWithRow();
      await fillFromLink(component);
      expect(unmatchedText()).not.toBeNull();

      component.hydrate(incidentFixture());
      fixture.detectChanges();

      expect(host().querySelector('[data-testid="fill-summary"]')).toBeNull();
    });

    it("drops an extracted time more than a day in the future but still applies the content", async () => {
      const component = await openWithRow();
      const threeDaysAhead = new Date(Date.now() + 3 * 86_400_000).toISOString();

      await fillFromLink(component, { ...FILLED, datetime: threeDaysAhead });

      expect(component.chronologies()[0].datetime).toBe("");
      expect(component.chronologies()[0].content).toBe("Trains held at KL Sentral");
    });

    it("drops an extracted time before the incident's start date", async () => {
      const component = await openWithRow();
      component.model.update((m) => ({ ...m, startDatetime: "2026-08-10T08:00" }));

      await fillFromLink(component, { ...FILLED, datetime: "2026-08-01T09:30:00+08:00" });

      expect(component.chronologies()[0].datetime).toBe("");
    });

    it("keeps an extracted time on or after the incident's start date", async () => {
      const component = await openWithRow();
      component.model.update((m) => ({ ...m, startDatetime: "2026-08-01T08:00" }));

      await fillFromLink(component, { ...FILLED, datetime: "2026-08-01T09:30:00+08:00" });

      expect(component.chronologies()[0].datetime).toBe(
        isoToDateTimeLocal("2026-08-01T09:30:00+08:00"),
      );
    });

    it("fills nothing and unlocks the row when the extraction fails", async () => {
      await loadReference();
      const component = await openWithRow();
      extractMock.mockRejectedValueOnce(new Error("Data extraction failed (502)"));

      await component.extractChronology(0);
      fixture.detectChanges();

      expect(component.isExtracting(0)).toBe(false);
      expect(component.model().title).toBe("");
      expect(component.chronologies()[0].content).toBe("");
      expect(host().querySelector('[data-testid="fill-summary"]')).toBeNull();
      expect(toastMocks.success).not.toHaveBeenCalled();
    });

    it("fills nothing when the extraction comes back empty", async () => {
      await loadReference();
      const component = await openWithRow();

      await fillFromLink(component, {
        title: null,
        datetime: null,
        content: null,
        source_url: "https://x.com/a/1",
        indicator: "other",
        severity: null,
        affected_lines: [],
        affected_stations: [],
      });

      expect(component.model()).toEqual(emptyIncidentFormModel());
      expect(component.selectedLineIds()).toEqual([]);
      expect(host().querySelector('[data-testid="fill-summary"]')).toBeNull();
      expect(toastMocks.success).not.toHaveBeenCalled();
    });

    it("applies a late result through Replace, and Undo puts the row back as it was", async () => {
      await loadReference();
      const component = await openWithRow();
      let resolve!: (value: unknown) => void;
      extractMock.mockReturnValueOnce(new Promise((done) => (resolve = done)));
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        const request = component.extractChronology(0);
        await vi.advanceTimersByTimeAsync(15_000);
        resolve({ requestId: "r1", data: FILLED });
        await request;
      } finally {
        vi.useRealTimers();
      }
      expect(component.hasLateResult(0)).toBe(true);
      expect(component.model().title).toBe("");

      component.replaceWithExtraction(0);
      fixture.detectChanges();

      expect(component.model().title).toBe("Signal fault at KL Sentral");
      expect(component.selectedLineIds()).toEqual(["4"]);
      expect(component.chronologies()[0]).toMatchObject({
        indicator: "RED",
        content: "Trains held at KL Sentral",
      });

      component.undoExtraction(0);
      fixture.detectChanges();

      expect(component.chronologies()[0]).toMatchObject({
        indicator: "GREEN",
        content: "",
        datetime: "",
      });
    });
  });
});
