import { Component, inject } from "@angular/core";
import { HlmButton } from "../../../ui/button/button";
import { REALTIME_LAYER_CHECKBOXES, STOPS_LAYER_CHECKBOXES } from "../data/layer-config";
import { GtfsRealtimeService } from "../data/gtfs-realtime.service";
import { GtfsStaticService } from "../data/gtfs-static.service";
import { LayerSelectionService } from "../data/layer-selection.service";

/**
 * The Apply/Undo pair — split out of LayerChecklistComponent so each host (the desktop card, the
 * mobile sheet) can render it *outside* the scrollable checklist area instead of as a sticky
 * footer bleeding into it. The previous in-panel sticky footer visually overlapped the last
 * checkbox row while scrolling; a real sibling below the scroll container can't overlap anything
 * inside it. Both hosts gate this on `layerSelection.hasUnsavedChanges()` themselves (see
 * status-card.component.ts / mobile-layer-sheet.component.ts) rather than this component hiding
 * itself internally, so an unapplied host never renders an empty bordered strip.
 */
@Component({
  selector: "app-layer-apply-bar",
  imports: [HlmButton],
  template: `
    <div class="flex items-center gap-2">
      <button hlmBtn size="sm" (click)="onApply()">Apply</button>
      <button hlmBtn size="sm" variant="outline" (click)="layerSelection.undo()">Undo</button>
    </div>
  `,
})
export class LayerApplyBarComponent {
  protected readonly layerSelection = inject(LayerSelectionService);
  private readonly gtfsRealtime = inject(GtfsRealtimeService);
  private readonly gtfsStatic = inject(GtfsStaticService);

  protected onApply(): void {
    const { realtime, stops } = this.layerSelection.apply(
      Object.fromEntries(REALTIME_LAYER_CHECKBOXES.map((c) => [c.value, c.endpoint])),
      Object.fromEntries(STOPS_LAYER_CHECKBOXES.map((c) => [c.value, c.endpoint])),
    );
    this.gtfsRealtime.upsertSources(realtime);
    this.gtfsStatic.upsertSources(stops);
  }
}
