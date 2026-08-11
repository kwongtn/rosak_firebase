import { Component, computed, input } from "@angular/core";
import { HlmBadge, type BadgeVariants } from "../../ui/badge/badge";
import { SpottingType } from "../../core/graphql/types";

/** Ported from @ui/spotting-type-tag. AT_STATION had no color in the old version (Coverage gap in shared-ui-components.md) — filled in here. */
const VARIANT_BY_TYPE: Record<SpottingType, BadgeVariants["variant"]> = {
  JUST_SPOTTING: "success",
  BETWEEN_STATIONS: "success",
  DEPOT: "warning",
  LOCATION: "destructive",
  AT_STATION: "accent",
};

const LABEL_BY_TYPE: Record<SpottingType, string> = {
  JUST_SPOTTING: "Just Spotting",
  BETWEEN_STATIONS: "Between Stations",
  DEPOT: "Depot",
  LOCATION: "Location",
  AT_STATION: "At Station",
};

@Component({
  selector: "spotting-type-badge",
  imports: [HlmBadge],
  template: '<span hlmBadge [variant]="_variant()">{{ _label() }}</span>',
})
export class SpottingTypeBadge {
  readonly type = input.required<SpottingType>();
  protected readonly _variant = computed(() => VARIANT_BY_TYPE[this.type()]);
  protected readonly _label = computed(() => LABEL_BY_TYPE[this.type()]);
}
