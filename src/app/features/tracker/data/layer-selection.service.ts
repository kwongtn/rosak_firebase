import { Injectable, computed, signal } from "@angular/core";
import { RtSourceConfig } from "./gtfs-realtime.service";
import { StaticSourceConfig } from "./gtfs-static.service";

/**
 * Draft checkbox selections + the "Apply" gate. Ported from PanelSelectionService, but the
 * route-layer ("Malaysia Railway") checkbox is now wired into the same apply flow as the other
 * two panels — in the old app it was pre-checked but never actually consulted by anything
 * (`onApply` never read `pathLayer`, and the map rendered the line unconditionally regardless
 * of the checkbox), which is the exact disconnect flagged in tracker.md Known Quirks.
 */
@Injectable({ providedIn: "root" })
export class LayerSelectionService {
  readonly realtimeChecked = signal<Record<string, boolean>>({});
  readonly stopsChecked = signal<Record<string, boolean>>({});
  /** Pre-checked by default, matching the old app. */
  readonly railwayChecked = signal(true);

  /** What's actually been applied and should be live on the map right now — snapshotted on
   * every `apply()` call, and what `undo()` reverts the drafts back to. */
  readonly appliedRealtimeChecked = signal<Record<string, boolean>>({});
  readonly appliedStopsChecked = signal<Record<string, boolean>>({});
  readonly appliedRailway = signal(true);

  readonly hasUnsavedChanges = signal(false);

  /** Per-panel draft counts — shown next to each panel's own title in LayerChecklistComponent,
   * and as the mobile bottom sheet's collapsed-state shorthand chips (see
   * MobileLayerSheetComponent), so a glance shows how many of *each* kind of layer is selected
   * without expanding anything. */
  readonly realtimeCount = computed(
    () => Object.values(this.realtimeChecked()).filter(Boolean).length,
  );
  readonly stopsCount = computed(() => Object.values(this.stopsChecked()).filter(Boolean).length);
  readonly railwayCount = computed(() => (this.railwayChecked() ? 1 : 0));

  /** Total checked (draft) layers across all three panels. */
  readonly selectedCount = computed(
    () => this.realtimeCount() + this.stopsCount() + this.railwayCount(),
  );

  toggleRealtime(value: string): void {
    this.realtimeChecked.update((state) => ({ ...state, [value]: !state[value] }));
    this.hasUnsavedChanges.set(true);
  }

  toggleStops(value: string): void {
    this.stopsChecked.update((state) => ({ ...state, [value]: !state[value] }));
    this.hasUnsavedChanges.set(true);
  }

  toggleRailway(): void {
    this.railwayChecked.update((v) => !v);
    this.hasUnsavedChanges.set(true);
  }

  /** Returns the source configs to apply, and marks the draft as applied. */
  apply(
    realtimeCatalog: Record<string, string>,
    stopsCatalog: Record<string, string>,
  ): { realtime: Record<string, RtSourceConfig>; stops: Record<string, StaticSourceConfig> } {
    const realtime: Record<string, RtSourceConfig> = {};
    for (const [value, checked] of Object.entries(this.realtimeChecked())) {
      if (checked) {
        realtime[value] = { sourceUrl: realtimeCatalog[value] };
      }
    }
    const stops: Record<string, StaticSourceConfig> = {};
    for (const [value, checked] of Object.entries(this.stopsChecked())) {
      if (checked) {
        stops[value] = { sourceUrl: stopsCatalog[value] };
      }
    }

    this.appliedRealtimeChecked.set(this.realtimeChecked());
    this.appliedStopsChecked.set(this.stopsChecked());
    this.appliedRailway.set(this.railwayChecked());
    this.hasUnsavedChanges.set(false);
    return { realtime, stops };
  }

  /** Discards the draft, reverting every checkbox back to whatever was last actually applied
   * (the layer-checklist's "Undo" button) — the counterpart to `apply()`, without touching the
   * map/services at all, since nothing was ever pushed to them for these un-applied toggles. */
  undo(): void {
    this.realtimeChecked.set(this.appliedRealtimeChecked());
    this.stopsChecked.set(this.appliedStopsChecked());
    this.railwayChecked.set(this.appliedRailway());
    this.hasUnsavedChanges.set(false);
  }
}
