import { Component, inject } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InsidenStore } from "./insiden.store";
import { INSIDEN_INCIDENTS_QUERY } from "./insiden.queries";

@Component({
  selector: "test-host",
  template: `<span>{{ store.allIncidents().length }}</span>`,
})
class TestHost {
  readonly store = inject(InsidenStore);
}

function flushedIncident(id: string, startDatetime: string, endDatetime: string | null) {
  return {
    id,
    startDatetime,
    endDatetime,
    severity: "MINOR" as const,
    title: `Incident ${id}`,
    brief: "",
    details: "",
    hasDetails: false,
    impactFactor: 0,
    longTerm: false,
    inaccurate: false,
    lastUpdated: "",
    lines: [],
    vehicles: [],
    stations: [],
    chronologies: [],
    voteScore: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    userVote: 0 as const,
    medias: [],
  };
}

describe("InsidenStore", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideZonelessChangeDetection(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("derives dayIncidents (sorted desc) and pinned from flushed data", async () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();

    const requests = httpMock.match((r) => r.method === "POST");
    expect(requests.length).toBe(1);
    expect(requests[0].request.body).toMatchObject({ query: INSIDEN_INCIDENTS_QUERY });
    requests[0].flush({
      data: {
        calendarIncidents: [
          // Ongoing (no end date), starts after the selected day → pinned, not in day list.
          flushedIncident("I1", "2026-08-05T08:00:00Z", null),
          // Covers the selected day (start 10:00) → day list, not pinned.
          flushedIncident("I2", "2026-08-01T10:00:00Z", "2026-08-01T12:00:00Z"),
          // Covers the selected day (start 09:00) → day list, sorted before I2.
          flushedIncident("I3", "2026-08-01T09:00:00Z", "2026-08-01T11:00:00Z"),
        ],
      },
    });
    await fixture.whenStable();

    const store = fixture.componentInstance.store;
    const date = "2026-08-01";
    expect(store.dayIncidents(date).map((i) => i.id)).toEqual(["I2", "I3"]);
    expect(store.pinned(date).map((i) => i.id)).toEqual(["I1"]);
  });

  it("drops a resolved long-term incident from pinned once it has an end date", () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const [req] = httpMock.match((r) => r.method === "POST");
    req.flush({
      data: {
        calendarIncidents: [
          // Long-term but resolved (has end date) and not covering the day → must NOT be pinned.
          flushedIncident("I1", "2026-07-20T08:00:00Z", "2026-07-25T18:00:00Z"),
        ],
      },
    });

    const store = fixture.componentInstance.store;
    expect(store.pinned("2026-08-01").map((i) => i.id)).toEqual([]);
  });
});
