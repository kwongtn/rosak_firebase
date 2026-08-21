import { type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import {
  APPROVE_INCIDENT_MUTATION,
  PENDING_INCIDENTS_QUERY,
  REJECT_INCIDENT_MUTATION,
  type PendingIncident,
} from "../data/insiden-console.queries";
import { PendingIncidentsComponent } from "./pending.component";

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
    lines: [],
    chronologies: [],
    ...overrides,
  };
}

/** The component's template-facing surface is `protected`; tests reach it
 * through this typed projection instead of leaking `any` into the suite. */
interface ComponentUnderTest {
  rows: WritableSignal<PendingIncident[]>;
  rejectTarget: WritableSignal<PendingIncident | null>;
  rejectReason: WritableSignal<string>;
  onSearchInput(value: string): void;
  approve(row: PendingIncident): Promise<void>;
  openReject(row: PendingIncident): void;
  confirmReject(): Promise<void>;
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
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: AuthService, useValue: { idToken: async () => "token" } },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
      ],
    }).compileComponents();

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
});
