import { Component, input, output } from "@angular/core";
import { HlmButton } from "../../../../ui/button/button";

/**
 * The `/console/links` selection toolbar, extracted from the page component.
 * Presentational: the group/minimum gates are inputs the parent computes, and the
 * three actions are outputs. The two-minimums rationale and the "Show all links"
 * explanation live here with the controls.
 */
@Component({
  selector: "app-links-selection-toolbar",
  imports: [HlmButton],
  templateUrl: "./links-selection-toolbar.component.html",
})
export class LinksSelectionToolbarComponent {
  readonly isLoading = input(false);
  readonly canGroupSelection = input(false);
  readonly selectedCount = input(0);
  readonly queueIsComplete = input(true);

  readonly groupSelected = output<void>();
  readonly clearSelection = output<void>();
  readonly showAllLinks = output<void>();
}
