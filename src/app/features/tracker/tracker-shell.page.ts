import { Component, OnDestroy, inject, signal } from "@angular/core";
import { GtfsRealtimeService } from "./data/gtfs-realtime.service";
import { TrackerMapComponent } from "./map/tracker-map.component";
import { TrackerMapSkeletonComponent } from "./map/tracker-map-skeleton.component";
import { StatusCardComponent } from "./status-card/status-card.component";
import { MobileLayerSheetComponent } from "./status-card/mobile-layer-sheet.component";
import { CompactNavComponent } from "../../shell/compact-nav/compact-nav.component";

/**
 * /tracker — full-bleed live vehicle map. Ported from tracker.component.ts, but with a real
 * `ngOnDestroy` that actually stops realtime polling (the old app's `ngOnInit`/`ngOnDestroy`
 * bodies were both fully commented out — see Known Quirks in tracker.md — so navigating away
 * left every active feed's `setInterval` running in the background indefinitely).
 *
 * Keeps a compact floating nav (the shared <app-compact-nav>) rather than the full-width
 * <app-nav> used by /spotting, /profile and /about — a full-width bar would eat into the
 * full-bleed map for no benefit here. The nav is told this *is* the Tracker module, so it never
 * lists "Tracker" as a selectable option (the current module is already shown in the pill's
 * brand/logo trigger).
 */
@Component({
  selector: "app-tracker-shell",
  imports: [
    TrackerMapComponent,
    TrackerMapSkeletonComponent,
    StatusCardComponent,
    MobileLayerSheetComponent,
    CompactNavComponent,
  ],
  template: `
    <div class="relative h-screen w-screen overflow-hidden">
      <app-compact-nav currentModulePath="/tracker" currentModuleLabel="Tracker" />

      <!-- The map component is ALWAYS rendered at full size. L7/Mapbox measures its
           container at init time, so hiding it (display:none / @if) during init leaves the
           scene sized 0x0 — it then renders as a small box in the corner and the path
           projection is offset. Instead we keep the map visible underneath and overlay the
           skeleton *on top* (higher z-index, non-interactive) until the map emits ready. -->
      <app-tracker-map class="absolute inset-0" (mapReady)="mapReady.set(true)" />
      @if (!mapReady()) {
        <div class="absolute inset-0 z-20 pointer-events-none">
          <app-tracker-map-skeleton class="absolute inset-0" />
        </div>
      }
      <div class="absolute top-3 right-3 z-10">
        <app-status-card />
      </div>
      <app-mobile-layer-sheet />
    </div>
  `,
})
export class TrackerShellPage implements OnDestroy {
  private readonly gtfsRealtime = inject(GtfsRealtimeService);

  /** Tracks whether the map has finished initializing (L7 scene + Mapbox + first data fetch).
   * Used to show a skeleton placeholder during initial load for better perceived performance. */
  protected readonly mapReady = signal(false);

  /** GtfsRealtimeService is root-provided — it (and its RtSources) outlive this component
   * across navigations. Resuming here (a no-op the very first time, since nothing's applied
   * yet) is what makes returning to /tracker fetch immediately rather than silently sitting on
   * whatever stale data/countdown was showing when `ngOnDestroy` paused everything below. */
  constructor() {
    this.gtfsRealtime.resumeAll();
  }

  ngOnDestroy(): void {
    this.gtfsRealtime.pauseAll();
  }
}
