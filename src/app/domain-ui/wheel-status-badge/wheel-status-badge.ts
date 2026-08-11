import { Component, computed, input } from "@angular/core";
import { HlmBadge, type BadgeVariants } from "../../ui/badge/badge";
import { WheelStatus } from "../../core/graphql/types";

const VARIANT_BY_STATUS: Record<WheelStatus, BadgeVariants["variant"]> = {
  FRESH: "success",
  NEAR_PERFECT: "success",
  FLAT: "warning",
  WORN_OUT: "destructive",
  WORRYING: "destructive",
};

/** Ported from @ui/wheel-status-tag. Renders nothing when unset — not every spotting logs wheel condition. */
@Component({
  selector: "wheel-status-badge",
  imports: [HlmBadge],
  template: `
    @if (status()) {
      <span hlmBadge [variant]="_variant()">{{ _label() }}</span>
    }
  `,
})
export class WheelStatusBadge {
  readonly status = input<WheelStatus | null | undefined>();
  protected readonly _variant = computed(() => VARIANT_BY_STATUS[this.status()!]);
  protected readonly _label = computed(() => {
    const status = this.status();
    if (!status) return "";
    return status
      .split("_")
      .map((word) => word[0] + word.slice(1).toLowerCase())
      .join(" ");
  });
}
