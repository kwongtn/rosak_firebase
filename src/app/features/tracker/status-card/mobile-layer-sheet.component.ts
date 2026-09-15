import { Component, inject, signal } from "@angular/core";
import { LayerSelectionService } from "../data/layer-selection.service";
import { LayerChecklistComponent } from "./layer-checklist.component";
import { LayerApplyBarComponent } from "./layer-apply-bar.component";

/**
 * Mobile equivalent of StatusCardComponent (hidden `sm:` and up) — a floating card makes no
 * sense on a narrow screen shared with the full-bleed map, so this collapses to a bottom sheet
 * instead: a slim always-visible bar showing how many layers are selected, expanding upward on
 * tap to the same checklist + Apply flow the desktop card uses.
 */
@Component({
  selector: "app-mobile-layer-sheet",
  imports: [LayerChecklistComponent, LayerApplyBarComponent],
  template: `
    <div class="sm:hidden">
      @if (expanded()) {
        <button
          type="button"
          class="fixed inset-0 z-20 bg-black/40"
          aria-label="Close layer selection"
          (click)="expanded.set(false)"
        ></button>
      }
      <div class="bg-background fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t shadow-lg">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-4 py-3"
          [attr.aria-expanded]="expanded()"
          (click)="expanded.set(!expanded())"
        >
          <span class="flex min-w-0 items-center gap-2 text-sm font-medium">
            Layers
            @if (!expanded()) {
              <!-- Collapsed shorthand: one chip per category (not the single combined
                                 badge shown while expanded) — "Layers [3]" alone doesn't say which
                                 kind of layer that count is made of, so a glance at the closed sheet
                                 couldn't tell realtime feeds from stops from the route overlay. -->
              <span class="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden">
                @if (layerSelection.realtimeCount() > 0) {
                  <span
                    class="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-xs tabular-nums"
                    >RT: {{ layerSelection.realtimeCount() }}</span
                  >
                }
                @if (layerSelection.railwayCount() > 0) {
                  <span
                    class="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-xs tabular-nums"
                    >Route: {{ layerSelection.railwayCount() }}</span
                  >
                }
                @if (layerSelection.stopsCount() > 0) {
                  <span
                    class="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-xs tabular-nums"
                    >Stops: {{ layerSelection.stopsCount() }}</span
                  >
                }
              </span>
            } @else if (layerSelection.selectedCount() > 0) {
              <span
                class="bg-primary text-primary-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums"
              >
                {{ layerSelection.selectedCount() }}
              </span>
            }
          </span>
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0 transition-transform duration-200"
            [class.rotate-180]="expanded()"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
        @if (expanded()) {
          <!-- Same split as StatusCardComponent's own hlmCardContent/hlmCardFooter: the
                         checklist scrolls in its own capped region; Apply/Undo sit below it,
                         outside that scroll area, so they can't overlap a scrolled-behind row. -->
          <div class="flex max-h-[60vh] flex-col border-t">
            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <app-layer-checklist />
            </div>
            @if (layerSelection.hasUnsavedChanges()) {
              <div class="border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                <app-layer-apply-bar />
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class MobileLayerSheetComponent {
  protected readonly layerSelection = inject(LayerSelectionService);
  protected readonly expanded = signal(false);
}
