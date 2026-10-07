import { Component, input, output } from "@angular/core";
import { HlmButton } from "../../../../ui/button/button";
import { HlmCardImports } from "../../../../ui/card/card";
import { HlmInput } from "../../../../ui/input/input";
import { HlmNativeSelect } from "../../../../ui/select/native-select";
import type { AssetMultiSelectOption } from "../../../insiden/asset-multi-select/asset-multi-select.component";
import { COMPLETED_LABEL, type CompletedFilter } from "./link-queue-filter.util";

/**
 * The `/console/links` filter card, extracted from the page component. Purely
 * presentational: every control reads an input and reports the committed value
 * through an output, so the parent keeps the debounce, the applied snapshot and the
 * refetch. The date-range relabel ("Submitted between" -> "Occurred between") and
 * its reasoning live here with the controls.
 */
@Component({
  selector: "app-links-filter-bar",
  imports: [HlmButton, HlmCardImports, HlmInput, HlmNativeSelect],
  templateUrl: "./links-filter-bar.component.html",
})
export class LinksFilterBarComponent {
  readonly searchTerm = input("");
  readonly categoryId = input("");
  readonly categories = input<{ id: string; name: string }[]>([]);
  readonly completedFilter = input<CompletedFilter>("pending");
  readonly lineOptions = input<AssetMultiSelectOption[]>([]);
  readonly filterLineId = input("");
  readonly filterVehicleOptions = input<AssetMultiSelectOption[]>([]);
  readonly filterVehicleId = input("");
  readonly filterStationOptions = input<AssetMultiSelectOption[]>([]);
  readonly filterStationId = input("");
  readonly filterDateFrom = input("");
  readonly filterDateTo = input("");

  readonly searchInput = output<string>();
  readonly categoryChange = output<string>();
  readonly completedChange = output<CompletedFilter>();
  readonly filterLineChange = output<string>();
  readonly filterVehicleChange = output<string>();
  readonly filterStationChange = output<string>();
  readonly dateFromInput = output<string>();
  readonly dateToInput = output<string>();
  readonly reset = output<void>();

  protected readonly completedFilterLabel = COMPLETED_LABEL;
}
