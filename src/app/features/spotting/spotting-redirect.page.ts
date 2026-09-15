import { Component, effect, inject } from "@angular/core";
import { Router } from "@angular/router";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { SpottingLinesStore } from "./data/spotting-lines.store";

/** Bare /spotting — redirects to the first line once the line list resolves. */
@Component({
  selector: "app-spotting-redirect",
  imports: [HlmSkeleton],
  template: '<div hlmSkeleton class="h-24 w-full"></div>',
})
export class SpottingRedirectPage {
  private readonly linesStore = inject(SpottingLinesStore);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      const firstLineId = this.linesStore.firstLineId();
      if (firstLineId) {
        this.router.navigate(["/spotting", firstLineId], { replaceUrl: true });
      }
    });
  }
}
