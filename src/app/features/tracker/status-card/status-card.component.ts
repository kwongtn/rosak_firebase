import { Component, computed, inject } from "@angular/core";
import { HlmCardImports } from "../../../ui/card/card";
import { LayerSelectionService } from "../data/layer-selection.service";
import { GtfsRealtimeService } from "../data/gtfs-realtime.service";
import { GtfsStaticService } from "../data/gtfs-static.service";
import { LayerChecklistComponent } from "./layer-checklist.component";
import { LayerApplyBarComponent } from "./layer-apply-bar.component";
import { StatusCardSkeletonComponent } from "./status-card-skeleton.component";

/**
 * Desktop floating layer-selection card. Hidden below `sm` — MobileLayerSheetComponent takes
 * over there with a bottom-sheet treatment better suited to a narrow viewport (see
 * tracker-shell.page.ts, which renders both and lets these breakpoint classes pick one).
 *
 * `hlmCardContent` scrolls on its own (`min-h-0 flex-1 overflow-y-auto`); the Apply/Undo bar sits
 * in a separate, non-scrolling `hlmCardFooter` below it — previously that pair lived *inside* the
 * scrolling content as a sticky footer, which visually overlapped whichever checkbox row happened
 * to be scrolled behind it. A real sibling outside the scroll container can't overlap anything.
 *
 * Shows a skeleton placeholder while the underlying GTFS data sources are loading for the first
 * time, providing immediate visual feedback instead of an empty card.
 */
@Component({
  selector: "app-status-card",
  imports: [
    LayerChecklistComponent,
    LayerApplyBarComponent,
    StatusCardSkeletonComponent,
    ...HlmCardImports,
  ],
  template: `
    <div hlmCard class="hidden h-[60vh] w-[576px] flex-col sm:flex">
      <div class="min-h-0 flex-1 overflow-y-auto">
        @if (isInitialLoading()) {
          <app-status-card-skeleton />
        } @else {
          <!-- min-h-full: gives this a definite height (100% of the scroll container above,
                       itself a definite-height flex item thanks to h-[60vh] on the card) so
                       LayerChecklistComponent's own min-h-full — which is what lets its last
                       category's mt-auto push down to the panel's bottom edge — has something real
                       to resolve against. Without this, hlmCardContent's default block auto-height
                       just shrinks to fit its content, and min-h-full on a *child* of an auto-height
                       parent is a no-op. -->
          <!-- flex-1 on the component host itself (not just min-h-full on hlmCardContent
                       above): hlmCardContent is a flex column with exactly one child, and a flex
                       item's main-axis size defaults to its own content height regardless of how
                       tall the container is — min-h-full on this div's *inner* template root has
                       nothing real to resolve against until this host is actually stretched to fill
                       hlmCardContent's height. -->
          <!-- flex flex-col min-h-full on the component's host itself, not just min-h-full
                       on hlmCardContent above: min-height/height percentages don't propagate
                       reliably through a custom-element host, so LayerChecklistComponent's own
                       inner root (styled "flex flex-1 min-h-0 flex-col") stretches to fill this via
                       ordinary flex-grow instead — that always works regardless of whether the
                       ancestor chain's heights are themselves "definite" in the percentage sense. -->
          <div hlmCardContent class="min-h-full">
            <app-layer-checklist class="flex min-h-full flex-1 flex-col" />
          </div>
        }
      </div>
      @if (!isInitialLoading() && layerSelection.hasUnsavedChanges()) {
        <div hlmCardFooter class="border-t pt-3">
          <app-layer-apply-bar />
        </div>
      }
    </div>
  `,
})
export class StatusCardComponent {
  protected readonly layerSelection = inject(LayerSelectionService);
  private readonly gtfsRealtime = inject(GtfsRealtimeService);
  private readonly gtfsStatic = inject(GtfsStaticService);

  /** True while any checked realtime or stops source hasn't completed its first load yet. */
  protected readonly isInitialLoading = computed(() => {
    const realtimeSources = this.gtfsRealtime.sources();
    const stopsSources = this.gtfsStatic.sources();
    const realtimeChecked = this.layerSelection.realtimeChecked();
    const stopsChecked = this.layerSelection.stopsChecked();

    // Check if any checked realtime source hasn't loaded once yet
    for (const [key, checked] of Object.entries(realtimeChecked)) {
      if (checked && realtimeSources[key] && !realtimeSources[key].hasLoadedOnce()) {
        return true;
      }
    }

    // Check if any checked stops source is still loading
    for (const [key, checked] of Object.entries(stopsChecked)) {
      if (checked && stopsSources[key] && stopsSources[key].isLoading()) {
        return true;
      }
    }

    return false;
  });
}
