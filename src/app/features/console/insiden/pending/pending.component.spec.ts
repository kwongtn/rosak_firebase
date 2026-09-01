import { Component, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { provideZonelessChangeDetection } from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import {
  APPROVE_INCIDENT_MUTATION,
  PENDING_INCIDENTS_QUERY,
  REJECT_INCIDENT_MUTATION,
  UPDATE_CALENDAR_INCIDENT_MUTATION,
  type PendingIncident,
} from "../data/insiden-console.queries";
import { AppNavComponent } from "../../../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../../../shell/app-footer/app-footer.component";
import { type IncidentFormModel } from "../../../insiden/incident-form/incident-form.schema";
import { type ChronologyDraft } from "../../../insiden/incident-form/chronology-list.util";
import { isoToDateTimeLocal } from "../../../insiden/incident-form/extract-data.util";
import { PendingIncidentsComponent } from "./pending.component";
/* The real app-nav/footer pull in browser-only services (ThemeService needs
 * matchMedia); the shell chrome is irrelevant to these specs, so swap in
 * empty stand-ins. */
@Component({ selector: "app-nav", template: "" })
class StubNav {}

@Component({ selector: "app-footer", template: "" })
class StubFooter {}

function makeRow(overrides: Partial<PendingIncident> = {}): PendingIncident {
  return {
    id: "inc-1",
    title: "LRT line down",
    brief: "Service suspended",
    details: "",
    severity: "MAJOR",
    startDatetime: "2026-08-01T08:00:00Z",
    endDatetime: null,
    created: "2026-08-01T09:00:00Z",
    lastUpdated: "2026-08-01T09:00:00Z",
    hasDetails: false,
    impactFactor: 0,
    longTerm: false,
    inaccurate: false,
    lines: [],
    vehicles: [],
    stations: [],
    categories: [],
    chronologies: [],
    voteScore: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    userVote: 0,
    medias: [],
    ...overrides,
  };
}

/** The component's template-facing surface is `protected`; tests reach it
 * through this typed projection instead of leaking `any` into the suite. */
interface ComponentUnderTest {
  rows: WritableSignal<PendingIncident[]>;
  isLoading: WritableSignal<boolean>;
  rejectTarget: WritableSignal<PendingIncident | null>;
  rejectReason: WritableSignal<string>;
  selectedRow: WritableSignal<PendingIncident | null>;
  model: WritableSignal<IncidentFormModel>;
  editImpactFactor: WritableSignal<number>;
  chronologies: WritableSignal<ChronologyDraft[]>;
  selectedLineIds: WritableSignal<string[]>;
  selectedVehicleIds: WritableSignal<string[]>;
  selectedStationIds: WritableSignal<string[]>;
  selectedCategoryIds: WritableSignal<string[]>;
  canSave: () => boolean;
  onSearchInput(value: string): void;
  approve(row: PendingIncident): Promise<boolean>;
  openReject(row: PendingIncident): void;
  confirmReject(): Promise<void>;
  openDetail(row: PendingIncident): void;
  closePanel(): void;
  approveFromPanel(): Promise<void>;
  rejectFromPanel(): void;
  savePanelEdit(): Promise<void>;
}

function asTestable(fixture: ComponentFixture<PendingIncidentsComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

describe("PendingIncidentsComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<PendingIncidentsComponent>;

  beforeEach(async () => {
    requestMock = vi.fn().mockImplementation((query: string) => {
      if (query.includes("pendingCalendarIncidents")) {
        return Promise.resolve({ pendingCalendarIncidents: [] });
      }
      return Promise.resolve({
        lines: [],
        stations: [],
        calendarIncidentCategories: [],
      });
    });
    await TestBed.configureTestingModule({
      imports: [PendingIncidentsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: GraphQLClient, useValue: { request: requestMock } },
        {
          provide: AuthService,
          useValue: { idToken: async () => "token", isLoggedIn: () => true, isAdmin: () => true },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
      ],
    }).compileComponents();

    TestBed.overrideComponent(PendingIncidentsComponent, {
      remove: { imports: [AppNavComponent, AppFooterComponent] },
      add: { imports: [StubNav, StubFooter] },
    });
    fixture = TestBed.createComponent(PendingIncidentsComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Zoneless whenStable() does not track the constructor's fire-and-forget
   * load promise — wait for the queue query (and the loading flag to drop).
   * The panel's reference data goes through graphqlResource's own HttpClient,
   * which is not part of requestMock (same as the links suite). */
  async function initialLoadsSettled(component: ComponentUnderTest): Promise<void> {
    await fixture.whenStable();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(component.isLoading()).toBe(false));
  }

  function callsFor(queryFragment: string): [string, Record<string, unknown>][] {
    return requestMock.mock.calls.filter((call) => (call[0] as string).includes(queryFragment)) as [
      string,
      Record<string, unknown>,
    ][];
  }

  it("loads the queue on init without a search filter", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const [, vars] = callsFor("pendingCalendarIncidents")[0];
    expect(vars).toEqual({ search: undefined });
  });

  it("debounces typing and refetches once with the trimmed term after 300ms", async () => {
    await initialLoadsSettled(asTestable(fixture));
    vi.useFakeTimers();
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.onSearchInput("  lrt");
    component.onSearchInput("  lrt kl ");
    await vi.advanceTimersByTimeAsync(299);
    expect(callsFor("pendingCalendarIncidents")).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(callsFor("pendingCalendarIncidents")).toHaveLength(1);
    const [, vars] = callsFor("pendingCalendarIncidents")[0];
    expect(vars).toEqual({ search: "lrt kl" });
  });

  it("approve calls the approve mutation and removes the row", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockResolvedValue({ ok: true });

    const component = asTestable(fixture);
    component.rows.set([makeRow()]);
    await component.approve(makeRow());

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(APPROVE_INCIDENT_MUTATION);
    expect(vars).toEqual({ incidentId: "inc-1" });
    expect(component.rows()).toEqual([]);
  });

  it("confirmReject refuses to fire without a reason", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.openReject(makeRow());
    component.rejectReason.set("   ");
    await component.confirmReject();

    expect(requestMock).not.toHaveBeenCalled();
  });

  it("confirmReject calls the reject mutation with the reason and closes the modal", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockResolvedValue({ ok: true });

    const component = asTestable(fixture);
    component.rows.set([makeRow({ id: "inc-9" })]);
    component.openReject(makeRow({ id: "inc-9" }));
    component.rejectReason.set("Duplicate of #12");
    await component.confirmReject();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(REJECT_INCIDENT_MUTATION);
    expect(vars).toEqual({ incidentId: "inc-9", reason: "Duplicate of #12" });
    expect(component.rows()).toEqual([]);
    expect(component.rejectTarget()).toBeNull();
  });

  it("keeps the row when the mutation fails", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockRejectedValueOnce(new Error("backend down"));

    const component = asTestable(fixture);
    component.rows.set([makeRow()]);
    await component.approve(makeRow());

    expect(component.rows().map((r) => r.id)).toEqual(["inc-1"]);
  });

  it("openDetail selects the row and prefills the full edit form", () => {
    const component = asTestable(fixture);
    const row = makeRow({
      title: "Original title",
      brief: "Original brief",
      details: "Original details",
      severity: "MINOR",
      endDatetime: "2026-08-01T10:00:00Z",
      longTerm: true,
      inaccurate: true,
      impactFactor: 2,
      lines: [{ id: "l1", code: "KJL", displayName: "Kelana Jaya" }],
      vehicles: [{ id: "v1", identificationNo: "18" }],
      stations: [{ id: "s1", displayName: "KL Sentral" }],
      categories: [{ id: "c1", name: "Signal" }],
      chronologies: [
        {
          order: 0,
          indicator: "RED",
          datetime: "2026-08-01T08:30:00Z",
          content: "Halt at KL Sentral",
          sourceUrl: "https://x.com/halt",
        },
      ],
    });

    component.openDetail(row);

    expect(component.selectedRow()).toEqual(row);
    expect(component.model()).toEqual({
      title: "Original title",
      brief: "Original brief",
      details: "Original details",
      startDatetime: isoToDateTimeLocal("2026-08-01T08:00:00Z"),
      endDatetime: isoToDateTimeLocal("2026-08-01T10:00:00Z"),
      severity: "MINOR",
      longTerm: true,
      inaccurate: true,
    });
    expect(component.editImpactFactor()).toBe(2);
    expect(component.chronologies()).toHaveLength(1);
    expect(component.chronologies()[0].indicator).toBe("RED");
    expect(component.chronologies()[0].datetime).toBe(isoToDateTimeLocal("2026-08-01T08:30:00Z"));
    expect(component.chronologies()[0].content).toBe("Halt at KL Sentral");
    expect(component.chronologies()[0].sourceUrl).toBe("https://x.com/halt");
    expect(component.chronologies()[0].collapsed).toBe(false);
    expect(component.selectedLineIds()).toEqual(["l1"]);
    expect(component.selectedVehicleIds()).toEqual(["v1"]);
    expect(component.selectedStationIds()).toEqual(["s1"]);
    expect(component.selectedCategoryIds()).toEqual(["c1"]);
  });

  it("openDetail sorts chronologies oldest-first and preserves an empty indicator timezone", () => {
    const component = asTestable(fixture);
    const row = makeRow({
      chronologies: [
        {
          order: 1,
          indicator: "GREEN",
          datetime: "2026-08-01T10:00:00Z",
          content: "Fixed",
          sourceUrl: null,
        },
        {
          order: 0,
          indicator: "BLUE",
          datetime: "2026-08-01T08:00:00Z",
          content: "Start",
          sourceUrl: null,
        },
      ],
    });

    component.openDetail(row);

    expect(component.chronologies().map((c) => c.indicator)).toEqual(["BLUE", "GREEN"]);
    expect(component.chronologies()[0].content).toBe("Start");
  });

  it("closePanel clears the selection and resets the edit form", () => {
    const component = asTestable(fixture);
    component.openDetail(makeRow());
    component.model.set({
      ...component.model(),
      title: "Edited title",
    });

    component.closePanel();

    expect(component.selectedRow()).toBeNull();
    expect(component.model().title).toBe("");
    expect(component.editImpactFactor()).toBe(0);
    expect(component.chronologies()).toEqual([]);
    expect(component.selectedLineIds()).toEqual([]);
    expect(component.selectedVehicleIds()).toEqual([]);
    expect(component.selectedStationIds()).toEqual([]);
    expect(component.selectedCategoryIds()).toEqual([]);
  });

  it("canSave reflects the schema-required fields (title/brief/start/severity)", () => {
    const component = asTestable(fixture);
    component.openDetail(makeRow());

    // Every required field is prefilled from the row → valid.
    expect(component.canSave()).toBe(true);

    component.model.set({ ...component.model(), title: "   " });
    expect(component.canSave()).toBe(false);

    component.model.set({ ...component.model(), title: "T", severity: "" });
    expect(component.canSave()).toBe(false);

    component.model.set({
      ...component.model(),
      severity: "MAJOR",
      endDatetime: "2000-01-01T00:00",
    });
    expect(component.canSave()).toBe(false);

    component.model.set({ ...component.model(), endDatetime: "" });
    expect(component.canSave()).toBe(true);
  });

  it("approveFromPanel approves, removes the row and closes the panel", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockResolvedValue({ ok: true });

    const component = asTestable(fixture);
    const row = makeRow();
    component.rows.set([row]);
    component.openDetail(row);
    await component.approveFromPanel();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(APPROVE_INCIDENT_MUTATION);
    expect(vars).toEqual({ incidentId: "inc-1" });
    expect(component.rows()).toEqual([]);
    expect(component.selectedRow()).toBeNull();
  });

  it("rejectFromPanel closes the detail panel and opens the reject modal", () => {
    const component = asTestable(fixture);
    component.openDetail(makeRow());

    component.rejectFromPanel();

    expect(component.selectedRow()).toBeNull();
    expect(component.rejectTarget()?.id).toBe("inc-1");
  });

  it("savePanelEdit sends the full edited form state and patches the row", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateCalendarIncident")) {
        return Promise.resolve({ updateCalendarIncident: { ok: true } });
      }
      return Promise.resolve({
        lines: [],
        stations: [],
        calendarIncidentCategories: [],
      });
    });

    const component = asTestable(fixture);
    const row = makeRow({
      endDatetime: "2026-08-01T10:00:00Z",
      longTerm: true,
      inaccurate: true,
      impactFactor: 2,
      details: "Full details",
      lines: [{ id: "l1", code: "KJL", displayName: "Kelana Jaya" }],
      vehicles: [{ id: "v1", identificationNo: "18" }],
      stations: [{ id: "s1", displayName: "KL Sentral" }],
      categories: [{ id: "c1", name: "Signal" }],
      chronologies: [
        {
          order: 0,
          indicator: "BLUE",
          datetime: "2026-08-01T08:00:00Z",
          content: "Start",
          sourceUrl: null,
        },
      ],
    });
    component.rows.set([row]);
    component.openDetail(row);
    component.model.set({
      title: "Fixed title",
      brief: "Fixed brief",
      details: "Fixed details",
      startDatetime: "2026-08-01T08:30",
      endDatetime: "",
      severity: "MAJOR",
      longTerm: false,
      inaccurate: true,
    });
    component.editImpactFactor.set(3);
    component.chronologies.set([
      {
        key: 99,
        indicator: "GREEN",
        datetime: "2026-08-01T09:00",
        sourceUrl: "https://x.com/fix",
        content: "Fixed",
        collapsed: false,
      },
    ]);
    component.selectedVehicleIds.set(["v1", "v2"]);
    component.selectedCategoryIds.set(["c1", "c2"]);
    await component.savePanelEdit();

    const mutationCalls = callsFor("updateCalendarIncident");
    expect(mutationCalls).toHaveLength(1);
    const [, vars] = mutationCalls[0];
    expect(vars).toEqual({
      calendarIncidentId: "inc-1",
      input: {
        title: "Fixed title",
        brief: "Fixed brief",
        details: "Fixed details",
        startDatetime: new Date("2026-08-01T08:30").toISOString(),
        endDatetime: null,
        severity: "MAJOR",
        longTerm: false,
        inaccurate: true,
        impactFactor: 3,
        lineIds: ["l1"],
        vehicleIds: ["v1", "v2"],
        stationIds: ["s1"],
        categoryIds: ["c1", "c2"],
        chronologies: [
          {
            indicator: "GREEN",
            datetime: new Date("2026-08-01T09:00").toISOString(),
            sourceUrl: "https://x.com/fix",
            content: "Fixed",
          },
        ],
      },
    });
    expect(component.rows()[0].title).toBe("Fixed title");
    expect(component.rows()[0].impactFactor).toBe(3);
    expect(component.rows()[0].hasDetails).toBe(true);
    expect(component.rows()[0].chronologies).toHaveLength(1);
    expect(component.selectedRow()?.title).toBe("Fixed title");
  });

  it("savePanelEdit refuses to fire while the form is invalid", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.openDetail(makeRow());
    component.model.set({ ...component.model(), title: "" });
    await component.savePanelEdit();

    expect(callsFor("updateCalendarIncident")).toHaveLength(0);
    expect(component.selectedRow()?.title).toBe("LRT line down");
  });
});
