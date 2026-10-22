import { provideHttpClient } from "@angular/common/http";
import { PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { GtfsRealtimeService } from "../data/gtfs-realtime.service";
import { GtfsStaticService, StaticSource } from "../data/gtfs-static.service";
import { LayerSelectionService } from "../data/layer-selection.service";
import type { IFeedEntity } from "../data/types";
import { InfoPanelKind, TrackerInfoPanelComponent } from "./tracker-info-panel.component";

type PanelInternals = {
  snapshotVehicles: { set(value: IFeedEntity): void };
  rows: () => Array<Record<string, string | number>>;
  highlightedJson: () => string;
  onSortClick: (col: string) => void;
  onExportCsv: () => void;
};

describe("TrackerInfoPanelComponent rows() stable id", () => {
  let fixture: ComponentFixture<TrackerInfoPanelComponent>;
  let component: TrackerInfoPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrackerInfoPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        GtfsRealtimeService,
        GtfsStaticService,
        LayerSelectionService,
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TrackerInfoPanelComponent);
    component = fixture.componentInstance;
  });

  it("adds a stable id matching vehicleId for realtime rows", () => {
    const panel = component as unknown as PanelInternals;
    fixture.componentRef.setInput("kind", "realtime");
    fixture.componentRef.setInput("sourceKey", "ktmb");
    panel.snapshotVehicles.set({
      v1: {
        vehicle: { id: "v1", label: "Train 1" },
        trip: { tripId: "t1" },
        position: { latitude: 1, longitude: 2, bearing: 0 },
        timestamp: 1000,
      },
    } as unknown as IFeedEntity);

    const rows = panel.rows();
    expect(rows.length).toBe(1);
    expect(rows[0]["id"]).toBe("v1");
    expect(rows[0]["id"]).toBe(rows[0]["vehicleId"]);
  });

  it("adds a stable id matching stopId for stops rows", () => {
    const panel = component as unknown as PanelInternals;
    fixture.componentRef.setInput("kind", "stops");
    fixture.componentRef.setInput("sourceKey", "mystop");

    const staticSvc = TestBed.inject(GtfsStaticService);
    const source = new StaticSource({ sourceUrl: "https://example.test/stops.zip" });
    source.stops.set({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "S1",
          properties: { stop_id: "S1", stop_name: "Central" },
          geometry: { type: "Point", coordinates: [100.1, 3.2] },
        },
      ],
    });
    staticSvc.sources.set({ mystop: source });

    const rows = panel.rows();
    expect(rows.length).toBe(1);
    expect(rows[0]["id"]).toBe("S1");
    expect(rows[0]["id"]).toBe(rows[0]["stopId"]);
  });
});

/** Every line break spelled out, so a CR inside a cell is visible in the assertion. */
function visible(csv: string): string {
  return csv.replace(/\r\n/g, "<CRLF>").replace(/\n/g, "<LF>").replace(/\r/g, "<CR>");
}

/** The text a Blob holds. jsdom's `Blob` has no `text()`, so read it through a `FileReader`. */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

const TWO_VEHICLES = {
  v1: {
    vehicle: { id: "v1", label: "Train 1" },
    trip: { tripId: "t1" },
    position: { latitude: 1, longitude: 2, bearing: 0 },
    timestamp: 1000,
  },
  v2: { vehicle: { id: "v2", label: 'Bus, "B"\r2' } },
} as unknown as IFeedEntity;

describe("TrackerInfoPanelComponent exports and renders feed text safely", () => {
  let component: TrackerInfoPanelComponent;
  let panel: PanelInternals;
  let createObjectURL: MockInstance<typeof URL.createObjectURL>;
  let revokeObjectURL: MockInstance<typeof URL.revokeObjectURL>;
  /** The `download` attribute of every anchor that was clicked, in click order. */
  const clicked: string[] = [];

  function setup(platformId: string) {
    TestBed.configureTestingModule({
      imports: [TrackerInfoPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: PLATFORM_ID, useValue: platformId },
      ],
    });
    const fixture = TestBed.createComponent(TrackerInfoPanelComponent);
    component = fixture.componentInstance;
    panel = component as unknown as PanelInternals;
    fixture.componentRef.setInput("kind", "realtime");
    fixture.componentRef.setInput("sourceKey", "ktmb");
    fixture.componentRef.setInput("label", "KTMB");
    panel.snapshotVehicles.set(TWO_VEHICLES);
  }

  beforeEach(() => {
    clicked.length = 0;
    // Spies on the two statics, not `vi.stubGlobal("URL", ...)`: a plain object is not a
    // constructor, and Angular's HTTP/router code calls `new URL(...)`.
    createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: {
      getAttribute(name: string): string | null;
    }) {
      clicked.push(this.getAttribute("download") ?? "");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports the table as an RFC 4180 CSV with every column and a quoted CR", async () => {
    setup("browser");

    panel.onExportCsv();

    expect(clicked).toEqual(["ktmb.csv"]);
    const [blob] = createObjectURL.mock.calls[0] as [Blob];
    expect(blob.type).toBe("text/csv;charset=utf-8;");
    expect(visible(await readBlobText(blob)).split("<CRLF>")).toEqual([
      "id,vehicleId,label,tripId,latitude,longitude,bearing,timestamp",
      "v1,v1,Train 1,t1,1,2,0,1000",
      'v2,v2,"Bus, ""B""<CR>2",,,,,',
      "",
    ]);
  });

  it("exports the rows in the order the table shows them", async () => {
    setup("browser");
    panel.onSortClick("id");
    panel.onSortClick("id");

    panel.onExportCsv();

    const [blob] = createObjectURL.mock.calls[0] as [Blob];
    const lines = visible(await readBlobText(blob)).split("<CRLF>");
    expect(lines[1]).toMatch(/^v2,/);
    expect(lines[2]).toMatch(/^v1,/);
  });

  it("revokes the blob URL on the next tick, not in the same turn as the click", async () => {
    setup("browser");

    panel.onExportCsv();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("does nothing during SSR", () => {
    setup("server");

    panel.onExportCsv();

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });

  it("highlights the raw JSON without letting a feed string become markup", () => {
    setup("browser");
    panel.snapshotVehicles.set({
      v1: { vehicle: { id: "v1", label: '<img src=x onerror="alert(1)">' }, timestamp: 5 },
    } as unknown as IFeedEntity);

    const host = document.createElement("pre");
    host.innerHTML = panel.highlightedJson();

    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain('"label": "<img src=x onerror=\\"alert(1)\\">"');
    // Keys, strings and numbers still get their own colour spans.
    const spanTexts = Array.from(host.querySelectorAll("span")).map((span) => span.textContent);
    expect(spanTexts).toContain('"label":');
    expect(spanTexts).toContain('"<img src=x onerror=\\"alert(1)\\">"');
    expect(spanTexts).toContain("5");
  });
});
