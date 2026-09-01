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
  rejectTarget: WritableSignal<PendingIncident | null>;
  rejectReason: WritableSignal<string>;
  selectedRow: WritableSignal<PendingIncident | null>;
  editTitle: WritableSignal<string>;
  editBrief: WritableSignal<string>;
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

/** Zoneless whenStable() does not track the constructor's fire-and-forget
 * load promise — wait for the query itself instead. */
function initialLoadSettled(mock: ReturnType<typeof vi.fn>): Promise<void> {
  return vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
}

describe("PendingIncidentsComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<PendingIncidentsComponent>;

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ pendingCalendarIncidents: [] });
    await TestBed.configureTestingModule({
      imports: [PendingIncidentsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: AuthService, useValue: { idToken: async () => "token" } },
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

  it("loads the queue on init without a search filter", async () => {
    await fixture.whenStable();
    await initialLoadSettled(requestMock);

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [query, vars] = requestMock.mock.calls[0];
    expect(query).toContain("pendingCalendarIncidents");
    expect(vars).toEqual({ search: undefined });
  });

  it("debounces typing and refetches once with the trimmed term after 300ms", async () => {
    await fixture.whenStable();
    await initialLoadSettled(requestMock);
    vi.useFakeTimers();
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.onSearchInput("  lrt");
    component.onSearchInput("  lrt kl ");
    await vi.advanceTimersByTimeAsync(299);
    expect(requestMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(requestMock).toHaveBeenCalledTimes(1);
    const [, vars] = requestMock.mock.calls[0];
    expect(vars).toEqual({ search: "lrt kl" });
  });

  it("approve calls the approve mutation and removes the row", async () => {
    await fixture.whenStable();
    await initialLoadSettled(requestMock);
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
    await fixture.whenStable();
    await initialLoadSettled(requestMock);
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.openReject(makeRow());
    component.rejectReason.set("   ");
    await component.confirmReject();

    expect(requestMock).not.toHaveBeenCalled();
  });

  it("confirmReject calls the reject mutation with the reason and closes the modal", async () => {
    await fixture.whenStable();
    await initialLoadSettled(requestMock);
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
    await fixture.whenStable();
    await initialLoadSettled(requestMock);
    requestMock.mockClear();
    requestMock.mockRejectedValueOnce(new Error("backend down"));

    const component = asTestable(fixture);
    component.rows.set([makeRow()]);
    await component.approve(makeRow());

    expect(component.rows().map((r) => r.id)).toEqual(["inc-1"]);
  });

  it("openDetail selects the row and prefills the edit fields", () => {
    const component = asTestable(fixture);
    const row = makeRow({ title: "Original title", brief: "Original brief" });

    component.openDetail(row);

    expect(component.selectedRow()).toEqual(row);
    expect(component.editTitle()).toBe("Original title");
    expect(component.editBrief()).toBe("Original brief");
  });

  it("approveFromPanel approves, removes the row and closes the panel", async () => {
    await fixture.whenStable();
    await initialLoadSettled(requestMock);
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

  it("savePanelEdit sends the updated title/brief with the full incident state", async () => {
    await fixture.whenStable();
    await initialLoadSettled(requestMock);
    requestMock.mockClear();
    requestMock.mockResolvedValue({ updateCalendarIncident: { ok: true } });

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
        {
          order: 1,
          indicator: "GREEN",
          datetime: "2026-08-01T10:00:00Z",
          content: "Fixed",
          sourceUrl: "https://x.com/fix",
        },
      ],
    });
    component.rows.set([row]);
    component.openDetail(row);
    component.editTitle.set("Fixed title");
    component.editBrief.set("Fixed brief");
    await component.savePanelEdit();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(UPDATE_CALENDAR_INCIDENT_MUTATION);
    expect(vars.calendarIncidentId).toBe("inc-1");
    expect(vars.input.title).toBe("Fixed title");
    expect(vars.input.brief).toBe("Fixed brief");
    expect(vars.input.startDatetime).toBe("2026-08-01T08:00:00Z");
    expect(vars.input.severity).toBe("MAJOR");
    expect(vars.input.endDatetime).toBe("2026-08-01T10:00:00Z");
    expect(vars.input.longTerm).toBe(true);
    expect(vars.input.inaccurate).toBe(true);
    expect(vars.input.impactFactor).toBe(2);
    expect(vars.input.details).toBe("Full details");
    expect(vars.input.lineIds).toEqual(["l1"]);
    expect(vars.input.vehicleIds).toEqual(["v1"]);
    expect(vars.input.stationIds).toEqual(["s1"]);
    expect(vars.input.categoryIds).toEqual(["c1"]);
    expect(vars.input.chronologies).toHaveLength(2);
    expect(vars.input.chronologies[0]).toEqual({
      indicator: "BLUE",
      datetime: "2026-08-01T08:00:00Z",
      content: "Start",
      sourceUrl: null,
    });
    expect(component.rows()[0].title).toBe("Fixed title");
    expect(component.selectedRow()?.title).toBe("Fixed title");
  });

  it("savePanelEdit refuses to save empty title or brief", async () => {
    await fixture.whenStable();
    await initialLoadSettled(requestMock);
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.openDetail(makeRow());
    component.editTitle.set("   ");
    await component.savePanelEdit();

    expect(requestMock).not.toHaveBeenCalled();
  });
});
