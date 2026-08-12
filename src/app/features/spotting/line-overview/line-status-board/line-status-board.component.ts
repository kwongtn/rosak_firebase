import { Component, computed, input } from "@angular/core";
import { DatePipe } from "@angular/common";
import { HlmCardImports } from "../../../../ui/card/card";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { VehicleType, VehicleRow } from "../../data/spotting.queries";

interface BoardStat {
  label: string;
  value: string;
  hint?: string;
}

/** Matches the up-to-4 real cards (3 stats + an optional "Most Recently Spotted") so the
 * skeleton occupies the same grid shape the loaded board settles into, rather than a
 * differently-sized placeholder that reflows once real data arrives. */
const SKELETON_CARD_COUNT = 4;

/**
 * At-a-glance line health stats — fleet composition and spotting-coverage signals, distinct from
 * the status chips below it (which are per-status counts, not coverage/engagement metrics).
 */
@Component({
  selector: "app-line-status-board",
  imports: [DatePipe, HlmSkeleton, ...HlmCardImports],
  template: `
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      @if (isLoading()) {
        @for (_ of skeletonCards; track $index) {
          <div hlmCard>
            <div hlmCardContent class="flex flex-col gap-2">
              <div hlmSkeleton class="h-3 w-20"></div>
              <div hlmSkeleton class="h-5 w-14"></div>
            </div>
          </div>
        }
      } @else {
        @for (stat of _stats(); track stat.label) {
          <div hlmCard>
            <div hlmCardContent>
              <p class="text-muted-foreground text-xs">{{ stat.label }}</p>
              <p class="text-lg font-semibold">{{ stat.value }}</p>
              @if (stat.hint) {
                <p class="text-muted-foreground text-xs">{{ stat.hint }}</p>
              }
            </div>
          </div>
        }
        @if (_mostRecent(); as vehicle) {
          <div hlmCard>
            <div hlmCardContent>
              <p class="text-muted-foreground text-xs">Most Recently Spotted</p>
              <p class="text-lg font-semibold">{{ vehicle.identificationNo }}</p>
              <p class="text-muted-foreground text-xs">{{ vehicle.lastSpottingDate | date }}</p>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class LineStatusBoardComponent {
  readonly vehicleTypes = input.required<VehicleType[]>();
  readonly isLoading = input(false);

  protected readonly skeletonCards = Array.from({ length: SKELETON_CARD_COUNT });

  private readonly _vehicles = computed(() => this.vehicleTypes().flatMap((t) => t.vehicles));

  protected readonly _mostRecent = computed<VehicleRow | undefined>(
    () =>
      [...this._vehicles()]
        .filter((v) => v.lastSpottingDate)
        .sort((a, b) => (a.lastSpottingDate! > b.lastSpottingDate! ? -1 : 1))[0],
  );

  protected readonly _stats = computed<BoardStat[]>(() => {
    const types = this.vehicleTypes();
    const vehicles = this._vehicles();
    const total = vehicles.length;
    const totalSpottings = vehicles.reduce((sum, v) => sum + v.spottingCount, 0);
    const neverSpotted = vehicles.filter((v) => v.spottingCount === 0).length;

    return [
      { label: "Vehicle Types", value: String(types.length) },
      {
        label: "Avg Spottings / Vehicle",
        value: total === 0 ? "—" : (totalSpottings / total).toFixed(1),
      },
      {
        label: "Never Spotted",
        value: String(neverSpotted),
        hint: total === 0 ? undefined : `${((neverSpotted / total) * 100).toFixed(0)}% of fleet`,
      },
    ];
  });
}
