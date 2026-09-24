import { Component, computed, input } from "@angular/core";
import { hlm } from "../utils/hlm";

export type DisclaimerVariant = "inline" | "footer";

/**
 * The one canonical MLPTF disclaimer, shared so every surface that shows derived figures carries
 * the same words (see METHODOLOGY_DOCS.md §5): a community project with no operator affiliation,
 * estimates that can be wrong or incomplete, and rail positions that are schedule-derived rather
 * than live. The copy lives here as a template literal on purpose — it is the shared contract, so
 * the spec asserts it directly instead of a page feeding it in.
 *
 * `inline` is the framed note that sits next to the numbers; `footer` is the same copy reduced to
 * bare muted text under a top rule for the page footer. No data dependencies and no browser APIs,
 * so it renders identically on the server.
 */
@Component({
  selector: "app-disclaimer-note",
  template: `
    <p data-testid="disclaimer-note" [class]="_classes()">
      MLPTF is an independent community project. We are not affiliated with Prasarana Malaysia,
      RapidKL, MRT Corp, or any transit operator. Figures here are estimates derived from official
      operator posts, community reports, and published schedules — they can be wrong or incomplete,
      and they are not official operator data. Rail positions and arrival times are
      schedule-derived, not live GPS or GTFS-Realtime. Do not use this site for safety-critical
      decisions.
    </p>
  `,
})
export class DisclaimerNote {
  readonly variant = input<DisclaimerVariant>("inline");

  protected readonly _classes = computed(() =>
    hlm(
      "text-muted-foreground text-xs leading-relaxed",
      this.variant() === "footer"
        ? "border-border/60 border-t pt-4"
        : "border-border/60 bg-muted/40 rounded-lg border p-3",
    ),
  );
}
