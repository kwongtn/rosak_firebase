import { Component, computed, input } from "@angular/core";
import { HlmBadge, type BadgeVariants } from "../../ui/badge/badge";
import { LineStatus } from "../../core/graphql/types";

const VARIANT_BY_STATUS: Record<LineStatus, BadgeVariants["variant"]> = {
  TESTING: "info",
  DEFUNCT: "neutral",
  ACTIVE: "success",
  PARTIAL_ACTIVE: "accent",
  PARTIAL_DISRUPTION: "warning",
  TOTAL_DISRUPTION: "destructive",
};

const LABEL_BY_STATUS: Record<LineStatus, string> = {
  TESTING: "Testing",
  DEFUNCT: "Defunct",
  ACTIVE: "Active",
  PARTIAL_ACTIVE: "Partially Active",
  PARTIAL_DISRUPTION: "Partial Disruption",
  TOTAL_DISRUPTION: "Total Disruption",
};

/** Ported from @ui/line-status-tag — see docs/frontend-map/shared-ui-components.md. */
@Component({
  selector: "line-status-badge",
  imports: [HlmBadge],
  template: '<span hlmBadge [variant]="_variant()">{{ _label() }}</span>',
})
export class LineStatusBadge {
  readonly status = input.required<LineStatus>();
  protected readonly _variant = computed(() => VARIANT_BY_STATUS[this.status()]);
  protected readonly _label = computed(() => LABEL_BY_STATUS[this.status()]);
}
