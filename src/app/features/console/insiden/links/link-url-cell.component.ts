import { Component, computed, input, output } from "@angular/core";
import { HlmBadge } from "../../../../ui/badge/badge";
import type { SocialMediaLinkRow } from "../data/insiden-console.queries";
import { DEPTH_INDENT_PX, depthRailsFor } from "./link-tree.util";

/**
 * The URL cell of one `/console/links` row: the depth rails + elbow, the accordion
 * chevron, the URL anchor and the `N links` chip. The plan's "tree-node" seam —
 * everything about a row's place in the conversation tree lives here, so the row
 * component is only the table cells around it. Presentational: the parent computes
 * `depth`/`childCount`/`expansion`/labels and handles `conversationToggle`.
 *
 * The host IS the `<td>` (attribute selector), so the row markup keeps exactly the
 * same eight cells with no extra wrapper element.
 */
@Component({
  selector: "td[app-link-url-cell]",
  imports: [HlmBadge],
  templateUrl: "./link-url-cell.component.html",
})
export class LinkUrlCellComponent {
  readonly link = input.required<SocialMediaLinkRow>();
  readonly depth = input(0);
  readonly childCount = input(0);
  readonly expanded = input(false);
  /** `threadLabel(sublinkCount + 1)` — the chip's visible text, `""` when absent. */
  readonly chipLabel = input("");
  /** `threadLabel(childCount + 1)` — the chevron's aria-label count. */
  readonly toggleLabel = input("");

  readonly conversationToggle = output<void>();

  /** The width of ONE rail — the single `DEPTH_INDENT_PX` definition. */
  protected readonly depthIndentPx = DEPTH_INDENT_PX;

  /** One entry per ancestor level; the VALUES are never read, only the LENGTH. */
  protected readonly depthRails = computed(() => depthRailsFor(this.depth()));
}
