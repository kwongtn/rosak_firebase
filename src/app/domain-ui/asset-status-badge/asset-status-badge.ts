import { Component, computed, input } from "@angular/core";
import { HlmBadge, type BadgeVariants } from "../../ui/badge/badge";
import { AssetStatus } from "../../core/graphql/types";

/**
 * A lift or escalator's status in the words riders use, not the schema's: IN_OPERATION reads "In
 * service" and UNDER_MAINTENANCE reads "Out of service". Out of service takes the same red as the
 * vehicle badge's "Out of Service". The state is the label's text, never colour alone, and the
 * visually hidden "Status:" prefix tells a screen reader what the bare words describe.
 */
const VARIANT_BY_STATUS: Record<AssetStatus, BadgeVariants["variant"]> = {
  IN_OPERATION: "success",
  UNDER_MAINTENANCE: "destructive",
};

const LABEL_BY_STATUS: Record<AssetStatus, string> = {
  IN_OPERATION: "In service",
  UNDER_MAINTENANCE: "Out of service",
};

/**
 * A status the tables above do not list (the backend enum grew first) falls back to a neutral
 * "Unknown" pill: a blank one would read as no status at all.
 */
@Component({
  selector: "asset-status-badge",
  imports: [HlmBadge],
  template:
    '<span hlmBadge [variant]="_variant()" data-testid="asset-status-badge"><span class="sr-only">Status: </span>{{ _label() }}</span>',
})
export class AssetStatusBadge {
  readonly status = input.required<AssetStatus>();
  protected readonly _variant = computed(() => VARIANT_BY_STATUS[this.status()] ?? "neutral");
  protected readonly _label = computed(() => LABEL_BY_STATUS[this.status()] ?? "Unknown");
}
