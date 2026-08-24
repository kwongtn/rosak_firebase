import { Component } from "@angular/core";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";

/**
 * Lightweight skeleton placeholder for the tracker map.
 * Shown while the real TrackerMapComponent initializes (L7 scene, Mapbox, data fetches).
 * Mirrors the full-bleed map dimensions and provides a subtle animated placeholder
 * so the user sees immediate feedback instead of a blank white screen.
 */
@Component({
  selector: "app-tracker-map-skeleton",
  imports: [HlmSkeleton],
  template: `
    <div class="relative h-full w-full overflow-hidden bg-muted/30">
      <!-- Subtle grid pattern to suggest a map -->
      <div
        class="absolute inset-0 [background-image:linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] [background-size:24px_24px]"
        aria-hidden="true"
      ></div>
      <!-- Centered loading indicator -->
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="flex flex-col items-center gap-4 text-muted-foreground">
          <div class="relative">
            <!-- Pulsing circle to suggest map loading -->
            <div
              hlmSkeleton
              class="size-16 rounded-full animate-pulse"
              style="animation-delay: 0ms"
            ></div>
            <div
              hlmSkeleton
              class="absolute inset-0 size-16 rounded-full animate-pulse"
              style="animation-delay: 200ms; opacity: 0.5"
            ></div>
            <div
              hlmSkeleton
              class="absolute inset-0 size-16 rounded-full animate-pulse"
              style="animation-delay: 400ms; opacity: 0.3"
            ></div>
          </div>
          <p class="text-sm font-medium">Loading map…</p>
          <p class="text-xs text-muted-foreground/70">Initializing vehicle data feeds</p>
        </div>
      </div>
      <!-- Bottom attribution hint (matches Mapbox attribution position) -->
      <div
        class="absolute bottom-2 left-2 right-2 text-[10px] text-muted-foreground/50 text-center"
      >
        Map data © OpenStreetMap contributors, © Mapbox
      </div>
    </div>
  `,
  host: { class: "block h-full w-full" },
})
export class TrackerMapSkeletonComponent {}
