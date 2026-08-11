import { Injectable, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import JSZip from "jszip";
import Papa from "papaparse";
import type { FeatureCollection, GeoJsonProperties, Point } from "geojson";

export interface StaticSourceConfig {
  sourceUrl: string;
}

interface StopRow {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

/**
 * One parsed GTFS-static source. Ported from StaticGtfs in gtfs-static-state.service.ts, but
 * only extracts `stops.txt` — the old version also parsed routes.txt/trips.txt/shapes.txt into
 * GeoJSON that nothing ever rendered (see Known Quirks in tracker.md); dropped as genuinely
 * dead work rather than ported faithfully. Uses `papaparse` instead of `csvtojson`, which is
 * Node-oriented and not browser-safe.
 */
export class StaticSource {
  readonly isLoading = signal(true);
  readonly stops = signal<FeatureCollection<Point, GeoJsonProperties>>({
    type: "FeatureCollection",
    features: [],
  });

  constructor(private readonly config: StaticSourceConfig) {}

  async load(zip: JSZip): Promise<void> {
    try {
      const file = zip.file("stops.txt");
      if (!file) {
        throw new Error("stops.txt not found in GTFS zip");
      }
      const csv = await file.async("string");
      const { data } = Papa.parse<StopRow>(csv, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
      });
      this.stops.set({
        type: "FeatureCollection",
        features: data
          .filter((row) => row.stop_lat != null && row.stop_lon != null)
          .map((row) => ({
            type: "Feature",
            id: row.stop_id,
            properties: { stop_id: row.stop_id, stop_name: row.stop_name },
            geometry: { type: "Point", coordinates: [row.stop_lon, row.stop_lat] },
          })),
      });
    } catch (err) {
      console.error("[tracker] failed to parse GTFS static source", this.config.sourceUrl, err);
    } finally {
      this.isLoading.set(false);
    }
  }
}

@Injectable({ providedIn: "root" })
export class GtfsStaticService {
  private readonly http = inject(HttpClient);

  readonly sources = signal<Record<string, StaticSource>>({});

  upsertSources(configs: Record<string, StaticSourceConfig>): void {
    const current = this.sources();
    const next: Record<string, StaticSource> = {};

    for (const [key, source] of Object.entries(current)) {
      if (configs[key]) {
        next[key] = source;
      }
    }
    for (const [key, config] of Object.entries(configs)) {
      if (!next[key]) {
        const source = new StaticSource(config);
        next[key] = source;
        this.fetchAndLoad(source, config.sourceUrl);
      }
    }
    this.sources.set(next);
  }

  private async fetchAndLoad(source: StaticSource, url: string): Promise<void> {
    try {
      // Routed through our own server (see server.ts's /api/gtfs-proxy) — api.data.gov.my
      // redirects to an S3 bucket that sends no CORS headers at all, so a direct browser
      // fetch is blocked outright regardless of how it's made; a server-to-server fetch
      // isn't subject to that browser-side restriction.
      const proxied = `/api/gtfs-proxy?url=${encodeURIComponent(url)}`;
      const body = await firstValueFrom(this.http.get(proxied, { responseType: "arraybuffer" }));
      const zip = await JSZip.loadAsync(body);
      await source.load(zip);
    } catch (err) {
      console.error("[tracker] failed to fetch GTFS static source", url, err);
      source.isLoading.set(false);
    }
  }
}
