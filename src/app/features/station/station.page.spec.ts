import { CUSTOM_ELEMENTS_SCHEMA, PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Meta, Title } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { afterEach, describe, expect, it } from "vitest";

import { METHODOLOGY_CONSTANTS } from "../../core/methodology/methodology.constants";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { NotFoundPage } from "../not-found/not-found.page";
import {
  STATION_INCIDENT_HISTORY_LIMIT,
  STATION_PAGE_QUERY,
  STATION_REPORTS_PER_LINE,
  type Station,
  type StationIncident,
  type StationPageQueryData,
  type StationReportNode,
} from "./data/station.queries";
import { StationPage } from "./station.page";

const ROUTE_TITLE = "MLPTF | Station";
const SITE_DESCRIPTION =
  "Community-run Malaysian public transport spotting, tracking and incident log.";

function makeStation(overrides: Partial<Station> = {}): Station {
  return {
    id: "1",
    displayName: "KL Sentral",
    lines: [
      {
        id: "4",
        code: "LRT KJL",
        displayName: "LRT Kelana Jaya Line",
        status: "ACTIVE",
        passengerStatus: "CROWDED",
      },
      {
        id: "8",
        code: "ERL",
        displayName: "ERL (Express Rail Link) - KLIA Transit & Express",
        status: "ACTIVE",
        passengerStatus: null,
      },
      {
        id: "11",
        code: "Skypark",
        displayName: "KTM Skypark Link",
        status: "DEFUNCT",
        passengerStatus: null,
      },
    ],
    assets: [],
    ...overrides,
  };
}

function incident(
  id: string,
  startDatetime: string,
  overrides: Partial<StationIncident> = {},
): StationIncident {
  return { id, startDatetime, severity: "MINOR", title: `Incident ${id}`, ...overrides };
}

function stationData(overrides: Partial<StationPageQueryData> = {}): StationPageQueryData {
  return { stations: [makeStation()], current: [], history: [], ...overrides };
}

function reportNode(id: string, created: string, stationIds: string[]): StationReportNode {
  return {
    id,
    status: "DELAYED",
    delayMinutes: null,
    notes: "",
    created,
    stations: stationIds.map((stationId) => ({ id: stationId })),
  };
}

/** A node's text with runs of whitespace folded to one space. */
function textOf(node: Element | null | undefined): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The text of each child element: chips sit side by side with no text node between them. */
function partsOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map(textOf);
}

let fixture: ComponentFixture<StationPage>;
let httpMock: HttpTestingController;

function seedHead(): void {
  document.head
    .querySelectorAll('meta[name="description"], meta[property^="og:"]')
    .forEach((tag) => tag.remove());
  const description = document.createElement("meta");
  description.setAttribute("name", "description");
  description.setAttribute("content", SITE_DESCRIPTION);
  document.head.appendChild(description);
  document.title = ROUTE_TITLE;
}

function create(id = "1", platform: "browser" | "server" = "browser"): void {
  seedHead();
  TestBed.configureTestingModule({
    imports: [StationPage],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: platform },
    ],
  }).overrideComponent(StationPage, {
    remove: { imports: [AppNavComponent, AppFooterComponent, NotFoundPage] },
    add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
  });
  httpMock = TestBed.inject(HttpTestingController);
  fixture = TestBed.createComponent(StationPage);
  fixture.componentRef.setInput("id", id);
  fixture.detectChanges();
  TestBed.tick();
}

function root(): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function byTestId(id: string): HTMLElement | null {
  return root().querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function allByTestId(id: string): HTMLElement[] {
  return [...root().querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}

function stationRequest(): TestRequest {
  return httpMock.expectOne((r) => r.method === "POST" && r.body.query === STATION_PAGE_QUERY);
}

function reportsRequest(): TestRequest {
  return httpMock.expectOne(
    (r) => r.method === "POST" && r.body.query.includes("query StationReports"),
  );
}

/** Lets the resource take the answer (it lands a task later) and run what depends on it. */
async function landed(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
}

/** Answers the station read, then (in the browser) the reports read it starts, and renders. */
async function answer(
  data: StationPageQueryData = stationData(),
  reports: Record<string, StationReportNode[]> | null = {},
): Promise<void> {
  stationRequest().flush({ data });
  await landed();
  if (reports !== null && (data.stations[0]?.lines.length ?? 0) > 0) {
    const edges = Object.fromEntries(
      (data.stations[0]?.lines ?? []).map((_, index) => [
        `line${index}`,
        { edges: (reports[`line${index}`] ?? []).map((node) => ({ node })) },
      ]),
    );
    reportsRequest().flush({ data: edges });
  }
  await fixture.whenStable();
  fixture.detectChanges();
}

afterEach(() => {
  httpMock.verify();
  fixture?.destroy();
});

describe("StationPage: the read", () => {
  it("asks for the station by the route's id only", async () => {
    create("1");
    const request = stationRequest();
    expect(request.request.body.variables).toEqual({ id: "1" });
    request.flush({ data: stationData({ stations: [makeStation({ lines: [] })] }) });
    await fixture.whenStable();
  });

  it("shows a skeleton until the station arrives", async () => {
    create();
    expect(byTestId("station-loading")).not.toBeNull();
    expect(byTestId("station-header")).toBeNull();
    await answer();
    expect(byTestId("station-loading")).toBeNull();
  });

  it("shows the retry banner when the read fails", async () => {
    create();
    stationRequest().flush({ errors: [{ message: "boom" }] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root().querySelector("app-retry-banner")).not.toBeNull();
    expect(byTestId("station-header")).toBeNull();
    expect(byTestId("station-not-found")).toBeNull();
  });
});

describe("StationPage: header and share tags", () => {
  it("names the station in the heading, the tab and the share tags", async () => {
    create();
    await answer();

    expect(textOf(byTestId("station-name"))).toBe("KL Sentral");
    expect(byTestId("station-name")?.tagName).toBe("H1");
    const meta = TestBed.inject(Meta);
    expect(TestBed.inject(Title).getTitle()).toBe("KL Sentral | MLPTF");
    expect(meta.getTag('property="og:title"')?.content).toBe("KL Sentral | MLPTF");
    expect(meta.getTag('property="og:description"')?.content).toContain("KL Sentral station");
    expect(meta.getTag('name="description"')?.content).toContain("KL Sentral station");
  });

  it("puts the route title and the site's tags back when the page is left", async () => {
    create();
    await answer();
    fixture.destroy();

    const meta = TestBed.inject(Meta);
    expect(TestBed.inject(Title).getTitle()).toBe(ROUTE_TITLE);
    expect(meta.getTag('name="description"')?.content).toBe(SITE_DESCRIPTION);
    expect(meta.getTag('property="og:title"')).toBeNull();
    expect(meta.getTag('property="og:description"')).toBeNull();
  });

  it("links each serving line to its page, with its current status", async () => {
    create();
    await answer();

    const lines = allByTestId("station-line");
    expect(lines.map((line) => line.getAttribute("href"))).toEqual([
      "/spotting/4/details",
      "/spotting/8/details",
      "/spotting/11/details",
    ]);
    expect(lines.map(partsOf)).toEqual([
      ["LRT KJL", "Active", "Crowded"],
      ["ERL", "Active"],
      ["Skypark", "Defunct"],
    ]);
    expect(lines[0]?.getAttribute("title")).toBe("LRT Kelana Jaya Line");
    // Riders' reading shows only on an Active line that has one, as on the board.
    expect(allByTestId("station-line-passenger")).toHaveLength(1);
    expect(byTestId("station-lines")?.getAttribute("aria-label")).toBe("Lines at this station");
  });
});

describe("StationPage: incidents", () => {
  it("lists the incidents in effect now, each linking to the day it starts on the calendar", async () => {
    create();
    await answer(
      stationData({
        current: [
          incident("91", "2026-10-22T07:15:00", { severity: "MAJOR", title: "KJL signal fault" }),
        ],
      }),
    );

    const rows = allByTestId("station-current-incident");
    expect(rows).toHaveLength(1);
    expect(partsOf(rows[0]?.querySelector("a"))).toEqual([
      "Major",
      "KJL signal fault",
      "22 Oct 2026",
    ]);
    expect(rows[0]?.querySelector("a")?.getAttribute("href")).toBe("/insiden/2026-10-22");
    expect(byTestId("station-current-empty")).toBeNull();
  });

  it("lists the newest of the other incidents, at most the published number", async () => {
    const history = Array.from({ length: STATION_INCIDENT_HISTORY_LIMIT + 2 }, (_, index) =>
      incident(String(100 - index), `2025-0${(index % 9) + 1}-1${index % 10}T09:00:00`),
    );
    create();
    await answer(stationData({ history }));

    const rows = allByTestId("station-history-incident");
    expect(rows).toHaveLength(STATION_INCIDENT_HISTORY_LIMIT);
    // In the order the backend sent (newest start first); the page only slices.
    expect(partsOf(rows[0]?.querySelector("a"))).toEqual(["Minor", "Incident 100", "10 Jan 2025"]);
    expect(rows[0]?.querySelector("a")?.getAttribute("href")).toBe("/insiden/2025-01-10");
    expect(textOf(rows.at(-1))).toContain("Incident 91");
  });

  it("keeps an incident whose start cannot be read, linking to the calendar with no day", async () => {
    create();
    await answer(stationData({ history: [incident("7", "soon", { title: "Undated fault" })] }));

    // No day to print or to open, so the row keeps its words and opens the calendar's landing day.
    const link = allByTestId("station-history-incident")[0]?.querySelector("a");
    expect(partsOf(link)).toEqual(["Minor", "Undated fault", ""]);
    expect(link?.getAttribute("href")).toBe("/insiden");
  });

  it("says so when no incident is in effect and none came before", async () => {
    create();
    await answer();

    expect(textOf(byTestId("station-current-empty"))).toBe(
      "No approved incident at this station is in effect now.",
    );
    expect(textOf(byTestId("station-history-empty"))).toBe(
      "No other approved incident is tagged with this station.",
    );
    expect(allByTestId("station-current-incident")).toHaveLength(0);
    expect(allByTestId("station-history-incident")).toHaveLength(0);
  });

  it("explains which incidents it lists, from the methodology registry", async () => {
    create();
    await answer();

    const section = byTestId("station-incidents");
    const trigger = section?.querySelector("app-info-popover button");
    expect(trigger?.getAttribute("aria-label")).toContain("Incidents at a station");
  });

  it("lists as many as the methodology page says", () => {
    expect(METHODOLOGY_CONSTANTS["STATION_INCIDENT_HISTORY_LIMIT"]?.value).toBe(
      STATION_INCIDENT_HISTORY_LIMIT,
    );
  });
});

describe("StationPage: lifts and escalators", () => {
  it("lists each asset with its status badge and the team-set note", async () => {
    create();
    await answer(
      stationData({
        stations: [
          makeStation({
            assets: [
              {
                id: "a1",
                assetType: "LIFT",
                status: "IN_OPERATION",
                officialid: "KJ15-L1",
                shortDescription: "Lift to Platform 1",
                longDescription: "",
              },
              {
                id: "a2",
                assetType: "ESCALATOR",
                status: "UNDER_MAINTENANCE",
                officialid: "KJ15-E4",
                shortDescription: "",
                longDescription: "Concourse to the northbound platform",
              },
            ],
          }),
        ],
      }),
    );

    const rows = allByTestId("station-asset");
    expect(rows.map((row) => partsOf(row.firstElementChild))).toEqual([
      ["Lift", "Lift to Platform 1", "Status: In service"],
      ["Escalator", "KJ15-E4", "Status: Out of service"],
    ]);
    // The long description only where there is one.
    expect(rows.map((row) => textOf(row.querySelector("p")))).toEqual([
      "",
      "Concourse to the northbound platform",
    ]);
    expect(rows[0]?.querySelectorAll("asset-status-badge")).toHaveLength(1);
    expect(byTestId("station-asset-note")).not.toBeNull();
    expect(byTestId("station-assets-empty")).toBeNull();
  });

  it("says so when the station has no asset on record (the local database has none)", async () => {
    create();
    await answer();

    expect(textOf(byTestId("station-assets-empty"))).toBe(
      "No lifts or escalators are recorded for this station yet.",
    );
    expect(byTestId("station-asset-note")).toBeNull();
  });
});

describe("StationPage: rider reports", () => {
  it("reads each serving line's newest reports once the station is known", async () => {
    create();
    stationRequest().flush({ data: stationData() });
    await landed();

    const request = reportsRequest();
    expect(request.request.body.variables).toEqual({
      first: STATION_REPORTS_PER_LINE,
      line0: "4",
      line1: "8",
      line2: "11",
    });
    request.flush({ data: { line0: { edges: [] }, line1: { edges: [] }, line2: { edges: [] } } });
    await fixture.whenStable();
  });

  it("shows the reports that name the station, newest first, with their line", async () => {
    create();
    await answer(stationData(), {
      line0: [
        reportNode("r1", "2026-10-22T08:00:00", ["1"]),
        reportNode("r2", "2026-10-22T08:30:00", ["65"]),
      ],
      line1: [reportNode("r3", "2026-10-22T08:10:00", ["65", "1"])],
    });

    const rows = allByTestId("station-report");
    expect(rows).toHaveLength(2);
    expect(
      rows.map((row) => textOf(row.querySelector('[data-testid="station-report-line"]'))),
    ).toEqual(["ERL", "LRT KJL"]);
    expect(textOf(rows[0])).toContain("Delayed");
    expect(
      rows[0]?.querySelector('[data-testid="station-report-time"]')?.getAttribute("title"),
    ).toBe("Reported Oct 22, 2026 08:10");
    expect(byTestId("station-reports-empty")).toBeNull();
  });

  it("says so when no report names the station", async () => {
    create();
    await answer(stationData(), { line0: [reportNode("r1", "2026-10-22T08:00:00", ["65"])] });

    expect(textOf(byTestId("station-reports-empty"))).toBe(
      "No recent report on these lines names this station.",
    );
    expect(allByTestId("station-report")).toHaveLength(0);
  });

  it("keeps the station on screen when the reports read fails, with a banner in that section only", async () => {
    create();
    stationRequest().flush({ data: stationData() });
    await landed();
    reportsRequest().flush({ errors: [{ message: "boom" }] });
    await fixture.whenStable();
    fixture.detectChanges();

    const banners = [...root().querySelectorAll("app-retry-banner")];
    expect(banners).toHaveLength(1);
    expect(byTestId("station-reports")?.contains(banners[0] ?? null)).toBe(true);
    expect(textOf(banners[0])).toContain("Couldn't load rider reports.");
    expect(allByTestId("station-report")).toHaveLength(0);
    expect(byTestId("station-reports-empty")).toBeNull();
    expect(textOf(byTestId("station-name"))).toBe("KL Sentral");
    expect(allByTestId("station-line")).toHaveLength(3);
  });

  it("does not read reports on the server, which renders the section waiting", async () => {
    create("1", "server");
    await answer(stationData(), null);

    expect(httpMock.match((r) => r.body.query.includes("query StationReports"))).toHaveLength(0);
    expect(byTestId("station-reports-loading")).not.toBeNull();
    expect(textOf(byTestId("station-name"))).toBe("KL Sentral");
  });

  it("searches as many reports per line as the methodology page says", () => {
    expect(METHODOLOGY_CONSTANTS["STATION_REPORTS_PER_LINE"]?.value).toBe(STATION_REPORTS_PER_LINE);
  });
});

describe("StationPage: a station that does not exist", () => {
  it("renders the 404 page when the backend has no such station", async () => {
    create("99999");
    stationRequest().flush({ data: stationData({ stations: [] }) });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byTestId("station-not-found")?.tagName).toBe("APP-NOT-FOUND");
    expect(byTestId("station-header")).toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe("MLPTF | Page not found");
  });

  it("renders the 404 page for an id that cannot be a station, without asking", () => {
    create("kl-sentral");

    expect(httpMock.match(() => true)).toHaveLength(0);
    expect(byTestId("station-not-found")).not.toBeNull();
  });

  it("gives the route its title back when it leaves the 404 state", async () => {
    create("99999");
    stationRequest().flush({ data: stationData({ stations: [] }) });
    await fixture.whenStable();
    fixture.destroy();

    expect(TestBed.inject(Title).getTitle()).toBe(ROUTE_TITLE);
  });
});
