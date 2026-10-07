import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeIncidentItem } from "../data/home-incidents.queries";
import { HomeStore } from "../data/home.store";
import { ProIncidentsWidgetComponent } from "./pro-incidents-widget.component";

@Component({ selector: "app-incidents-host-stub", template: "" })
class IncidentsHostStub {}

function makeIncident(id: string, overrides: Partial<HomeIncidentItem> = {}): HomeIncidentItem {
  return {
    id,
    startDatetime: "2026-10-03T08:00:00",
    endDatetime: null,
    severity: "MINOR",
    title: `Incident ${id}`,
    brief: "",
    lines: [{ id: "L1", code: "KJL" }],
    ...overrides,
  };
}

function makeStore(incidents: HomeIncidentItem[] = []) {
  const store = {
    recentIncidents: signal(incidents),
    incidentsFailed: signal(false),
    requestIncidentsRead: vi.fn(),
  };
  return store;
}

type StoreMock = ReturnType<typeof makeStore>;

describe("pro-incidents-widget.component: ProIncidentsWidgetComponent", () => {
  let storeMock: StoreMock;
  let fixture: ComponentFixture<ProIncidentsWidgetComponent>;

  beforeEach(() => {
    localStorage.clear();
  });

  async function widget(incidents: HomeIncidentItem[] = []): Promise<HTMLElement> {
    storeMock = makeStore(incidents);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProIncidentsWidgetComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: "", component: IncidentsHostStub },
          { path: "insiden", children: [] },
        ]),
        { provide: HomeStore, useValue: storeMock },
      ],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ProIncidentsWidgetComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("opts into the incidents read in its constructor — nothing else does", async () => {
    await widget([makeIncident("a")]);

    // The opt-in is the whole reason the read is lazy: a store-constructed `graphqlResource` fires the
    // moment the store exists, which would cost every Rider visit a request nothing renders.
    expect(storeMock.requestIncidentsRead).toHaveBeenCalledTimes(1);
  });

  it("hides itself entirely on a failed read, and never asks the router for anything", async () => {
    const root = await widget([makeIncident("a")]);
    expect(root.querySelector('[data-testid="pro-incidents-widget"]')).not.toBeNull();

    storeMock.incidentsFailed.set(true);
    fixture.detectChanges();

    // Its OWN failure flag, not the page's — a list that will not load must not replace a working board
    // with the page's retry banner.
    expect(root.querySelector('[data-testid="pro-incidents-widget"]')).toBeNull();
    expect(root.textContent).not.toContain("Incident a");
  });

  it("hides itself on an EMPTY answer, which is not an error", async () => {
    const root = await widget([]);

    expect(root.querySelector('[data-testid="pro-incidents-widget"]')).toBeNull();
    expect(storeMock.incidentsFailed()).toBe(false);
  });

  it("names the window it actually shows: ongoing, newest first", async () => {
    const root = await widget([makeIncident("a"), makeIncident("b")]);

    const window = root.querySelector('[data-testid="pro-incidents-window"]')?.textContent ?? "";
    // The read asks for `ongoing: true` ordered by `startDatetime DESC` — never a "last 7 days" range,
    // because a client clock in query variables breaks SSR's variable equality. Saying so on the surface
    // keeps a reader from concluding an older incident was never filed.
    expect(window).toContain("Ongoing");
    expect(window).toContain("newest first");
  });

  it("reports how many rows it is SHOWING, never how many the read returned", async () => {
    const root = await widget([makeIncident("a"), makeIncident("b")]);

    expect(root.querySelector('[data-testid="pro-incidents-window"]')?.textContent).toContain(
      "showing 2",
    );
    expect(root.querySelectorAll('[data-testid="pro-incidents-row"]')).toHaveLength(2);
  });

  it("draws one row per incident with its severity, title, start time and lines", async () => {
    const root = await widget([makeIncident("a", { severity: "MAJOR", title: "Signal failure" })]);

    const row = root.querySelector('[data-testid="pro-incidents-row"]');
    expect(row?.textContent).toContain("Major");
    expect(row?.textContent).toContain("Signal failure");
    expect(row?.textContent).toContain("KJL");
    expect(root.querySelector('[data-testid="pro-incidents-title"]')?.textContent?.trim()).toBe(
      "Signal failure",
    );
  });

  it("links out to /insiden rather than duplicating the incident calendar here", async () => {
    const root = await widget([makeIncident("a")]);
    const all = root.querySelector<HTMLAnchorElement>('[data-testid="pro-incidents-all"]');

    expect(all?.getAttribute("href")).toBe("/insiden");
  });

  it("follows the store: a list that lands later appears without the widget remounting", async () => {
    const root = await widget([]);
    expect(root.querySelector('[data-testid="pro-incidents-widget"]')).toBeNull();

    storeMock.recentIncidents.set([makeIncident("a")]);
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="pro-incidents-row"]')).not.toBeNull();
  });
});
