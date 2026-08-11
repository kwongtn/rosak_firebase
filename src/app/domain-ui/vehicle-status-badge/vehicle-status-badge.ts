import { Component, computed, input } from "@angular/core";
import { HlmBadge, type BadgeVariants } from "../../ui/badge/badge";
import { SpottingVehicleStatus, VehicleStatus } from "../../core/graphql/types";

type AnyVehicleStatus = VehicleStatus | SpottingVehicleStatus;

/**
 * Ported from @ui/vehicle-status-tag. The old ng-zorro version left DECOMMISSIONED, MARRIED,
 * and NOT_IN_SERVICE uncolored (see shared-ui-components.md Coverage gap) — filled in here
 * rather than reproduced, since all three are as operationally significant as OUT_OF_SERVICE.
 */
const VARIANT_BY_STATUS: Record<AnyVehicleStatus, BadgeVariants["variant"]> = {
  IN_SERVICE: "success",
  TESTING: "info",
  NOT_SPOTTED: "warning",
  NOT_IN_SERVICE: "warning",
  OUT_OF_SERVICE: "destructive",
  UNKNOWN: "neutral",
  DECOMMISSIONED: "outline",
  MARRIED: "special",
};

const LABEL_BY_STATUS: Record<AnyVehicleStatus, string> = {
  IN_SERVICE: "In Service",
  TESTING: "Testing",
  NOT_SPOTTED: "Not Spotted",
  NOT_IN_SERVICE: "Not in Service",
  OUT_OF_SERVICE: "Out of Service",
  UNKNOWN: "Unknown",
  DECOMMISSIONED: "Decommissioned",
  MARRIED: "Married",
};

@Component({
  selector: "vehicle-status-badge",
  imports: [HlmBadge],
  template: '<span hlmBadge [variant]="_variant()">{{ _label() }}</span>',
})
export class VehicleStatusBadge {
  readonly status = input.required<AnyVehicleStatus>();
  protected readonly _variant = computed(() => VARIANT_BY_STATUS[this.status()]);
  protected readonly _label = computed(() => LABEL_BY_STATUS[this.status()]);
}
