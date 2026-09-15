import { Component } from "@angular/core";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { HlmCardImports } from "../../../ui/card/card";

/**
 * Skeleton placeholder for the status card (layer selection panel).
 * Shown while layer data is being fetched or when the panel is first rendering.
 * Mirrors the structure of StatusCardComponent with animated placeholders.
 */
@Component({
  selector: "app-status-card-skeleton",
  imports: [HlmSkeleton, ...HlmCardImports],
  template: `
    <div hlmCard class="hidden h-[60vh] w-[576px] flex-col sm:flex">
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div hlmCardContent class="min-h-full flex flex-col gap-4 p-1">
          <!-- Realtime layer section skeleton -->
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <div hlmSkeleton class="h-5 w-24 rounded"></div>
              <div hlmSkeleton class="h-5 w-20 rounded-full"></div>
              <div hlmSkeleton class="h-6 w-28 rounded-md"></div>
            </div>
            <div class="space-y-2">
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <div hlmSkeleton class="h-4 w-4 rounded"></div>
                    <div hlmSkeleton class="h-4 w-[200px] rounded"></div>
                  </div>
                  <div class="flex items-center gap-2">
                    <div hlmSkeleton class="size-7 rounded-full"></div>
                    <div hlmSkeleton class="h-5 w-5 rounded-full"></div>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Route layer section skeleton -->
          <div class="space-y-3 border-t pt-4">
            <div class="flex items-center gap-2">
              <div hlmSkeleton class="h-5 w-20 rounded"></div>
              <div hlmSkeleton class="h-5 w-16 rounded-full"></div>
            </div>
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <div hlmSkeleton class="h-4 w-4 rounded"></div>
                <div hlmSkeleton class="h-4 w-[180px] rounded"></div>
              </div>
              <div hlmSkeleton class="h-5 w-5 rounded-full"></div>
            </div>
          </div>

          <!-- Stops layer section skeleton -->
          <div class="space-y-3 border-t pt-4 mt-auto">
            <div class="flex items-center gap-2">
              <div hlmSkeleton class="h-5 w-20 rounded"></div>
              <div hlmSkeleton class="h-5 w-16 rounded-full"></div>
            </div>
            <div class="space-y-2">
              @for (i of [1, 2, 3]; track i) {
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <div hlmSkeleton class="h-4 w-4 rounded"></div>
                    <div hlmSkeleton class="h-4 w-[180px] rounded"></div>
                  </div>
                  <div class="flex items-center gap-2">
                    <div hlmSkeleton class="h-5 w-5 rounded-full"></div>
                    <div hlmSkeleton class="h-5 w-5 rounded-full"></div>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
      <!-- Footer skeleton (apply bar) -->
      <div hlmCardFooter class="border-t pt-3">
        <div hlmSkeleton class="h-10 w-full max-w-[200px] rounded-md"></div>
      </div>
    </div>
  `,
  host: { class: "block" },
})
export class StatusCardSkeletonComponent {}
