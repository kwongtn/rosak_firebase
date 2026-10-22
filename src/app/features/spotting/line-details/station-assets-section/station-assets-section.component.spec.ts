import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastService } from "../../../../ui/toast/toast.service";
import type { LineStationAssetsQueryData } from "../../data/spotting.queries";
import { StationAssetsSectionComponent } from "./station-assets-section.component";

type Station = LineStationAssetsQueryData["lines"][number]["stations"][number];

/** A line whose first station has one working lift and one escalator out of service, and whose
 *  second has no assets: the three cases the section has to tell apart. */
const STATIONS: Station[] = [
  {
    id: "1",
    displayName: "KL Sentral",
    assets: [
      {
        id: "a1",
        assetType: "LIFT",
        status: "IN_OPERATION",
        officialid: "KJ15-L1",
        shortDescription: "Lift to Platform 1",
      },
      {
        id: "a2",
        assetType: "ESCALATOR",
        status: "UNDER_MAINTENANCE",
        officialid: "KJ15-E4",
        shortDescription: null,
      },
    ],
  },
  { id: "2", displayName: "Pasar Seni", assets: [] },
];

/** The bare field names selected directly under `field { … }`, read out of the document the
 *  component SENDS rather than imported from it, so a field dropped from (or a forbidden one added
 *  to) the query turns this red. Brace-matching keeps the sibling selections out. */
function fieldsUnder(doc: string, field: string): string[] {
  const open = doc.search(new RegExp(`\\b${field}\\s*\\{`));
  if (open < 0) {
    throw new Error(`the document has no ${field} selection`);
  }
  const bodyStart = doc.indexOf("{", open) + 1;
  let depth = 1;
  let cursor = bodyStart;
  while (cursor < doc.length && depth > 0) {
    const ch = doc[cursor];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    }
    cursor++;
  }
  return doc
    .slice(bodyStart, cursor - 1)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(line));
}

/** A node's text with runs of whitespace (template indentation, line breaks) folded to one space. */
function textOf(node: Element | null | undefined): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("StationAssetsSectionComponent", () => {
  let fixture: ComponentFixture<StationAssetsSectionComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StationAssetsSectionComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StationAssetsSectionComponent);
    fixture.componentRef.setInput("lineId", "4");
    fixture.detectChanges();
    TestBed.tick();
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Answers the section's one assets request with `stations` and renders the result. */
  async function answerWith(stations: Station[]): Promise<void> {
    httpMock
      .expectOne((r) => r.method === "POST" && r.body.query.includes("LineStationAssets"))
      .flush({ data: { lines: [{ id: "4", stations }] } satisfies LineStationAssetsQueryData });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function assetRows(): HTMLElement[] {
    return [...root().querySelectorAll<HTMLElement>('[data-testid="station-asset"]')];
  }

  it("asks for each asset's status, and never selects Asset.stations (it errors at runtime)", async () => {
    const req = httpMock.expectOne(
      (r) => r.method === "POST" && r.body.query.includes("LineStationAssets"),
    );
    expect(req.request.body.variables).toEqual({ lineId: "4" });

    const assetFields = fieldsUnder(req.request.body.query, "assets");
    expect(assetFields).toEqual(
      expect.arrayContaining(["id", "assetType", "status", "officialid", "shortDescription"]),
    );
    expect(assetFields).not.toContain("stations");
    req.flush({ data: { lines: [{ id: "4", stations: [] }] } });
    await fixture.whenStable();
  });

  it("shows each asset's status beside it, in service or out of service", async () => {
    await answerWith(STATIONS);

    const [lift, escalator] = assetRows();
    expect(assetRows()).toHaveLength(2);
    expect(textOf(lift)).toBe("Lift Lift to Platform 1 Status: In service");
    expect(textOf(escalator)).toBe("Escalator KJ15-E4 Status: Out of service");
    // One badge per asset, inside that asset's own row rather than in a summary elsewhere.
    expect(lift.querySelectorAll("asset-status-badge")).toHaveLength(1);
    expect(escalator.querySelectorAll("asset-status-badge")).toHaveLength(1);
  });

  it("says the team sets the status, not live rider reports, and drops the old promise", async () => {
    await answerWith(STATIONS);

    const note = root().querySelector('[data-testid="asset-status-note"]');
    expect(textOf(note)).toBe(
      "Each asset's status is set by the MLPTF team, not reported live by riders, so it can lag behind a breakdown.",
    );
    expect(textOf(root())).not.toContain("coming soon");
    // Not in the pinned header: a sentence there would make the sticky bar taller on a phone.
    expect(note?.closest(".sticky")).toBeNull();
  });

  it("has no note while the first load is pending: there is no status yet to qualify", () => {
    expect(root().querySelector("[hlmskeleton]")).not.toBeNull();
    expect(root().querySelector('[data-testid="asset-status-note"]')).toBeNull();

    httpMock.expectOne((r) => r.method === "POST").flush({ data: { lines: [] } });
  });

  it("has no note when the request failed", async () => {
    httpMock
      .expectOne((r) => r.method === "POST" && r.body.query.includes("LineStationAssets"))
      .flush({ message: "boom" }, { status: 500, statusText: "Server Error" });
    await fixture.whenStable();
    TestBed.tick();
    fixture.detectChanges();

    expect(root().querySelector("app-retry-banner")).not.toBeNull();
    expect(root().querySelector('[data-testid="asset-status-note"]')).toBeNull();
  });

  it("renders no status badge and no note for a line with no assets (the local database has none)", async () => {
    await answerWith([
      { id: "1", displayName: "KL Sentral", assets: [] },
      { id: "2", displayName: "Pasar Seni", assets: [] },
    ]);

    expect(assetRows()).toHaveLength(0);
    expect(root().querySelectorAll("asset-status-badge")).toHaveLength(0);
    expect(root().querySelector('[data-testid="asset-status-note"]')).toBeNull();
    expect(textOf(root()).match(/No assets recorded yet\./g)).toHaveLength(2);
  });

  it("keeps a station with no assets next to ones that have them", async () => {
    await answerWith(STATIONS);

    const stationNames = [...root().querySelectorAll("h3")].map(textOf);
    expect(stationNames).toEqual(["KL Sentral", "Pasar Seni"]);
    expect(textOf(root())).toContain("No assets recorded yet.");
  });

  it("links each station's name to its station page", async () => {
    await answerWith(STATIONS);

    const links = [
      ...root().querySelectorAll<HTMLAnchorElement>('h3 [data-testid="station-assets-station"]'),
    ];
    expect(links.map((link) => [textOf(link), link.getAttribute("href")])).toEqual([
      ["KL Sentral", "/station/1"],
      ["Pasar Seni", "/station/2"],
    ]);
  });
});
