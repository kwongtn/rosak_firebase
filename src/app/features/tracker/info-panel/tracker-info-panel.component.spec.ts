import { provideHttpClient } from "@angular/common/http";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { GtfsRealtimeService } from "../data/gtfs-realtime.service";
import { GtfsStaticService, StaticSource } from "../data/gtfs-static.service";
import { LayerSelectionService } from "../data/layer-selection.service";
import type { IFeedEntity } from "../data/types";
import { InfoPanelKind, TrackerInfoPanelComponent } from "./tracker-info-panel.component";

type PanelInternals = {
  snapshotVehicles: { set(value: IFeedEntity): void };
  rows: () => Array<Record<string, string | number>>;
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
