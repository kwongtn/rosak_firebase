import { Component, computed, inject, signal } from "@angular/core";
import { HlmButton } from "../../../ui/button/button";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import {
  REALTIME_LAYER_CHECKBOXES,
  STOPS_LAYER_CHECKBOXES,
  RAILWAY_LINE_SOURCE,
  LayerCheckbox,
} from "../data/layer-config";
import { GtfsRealtimeService, RefreshIntervalMs } from "../data/gtfs-realtime.service";
import { GtfsStaticService } from "../data/gtfs-static.service";
import { LayerSelectionService } from "../data/layer-selection.service";
import { CountdownRingComponent } from "./countdown-ring.component";
import {
  InfoPanelKind,
  TrackerInfoPanelComponent,
} from "../info-panel/tracker-info-panel.component";

/** Shared by every <summary> below — sticky against this checklist's own scrolling ancestor (the
 * card/sheet host's overflow-y-auto panel) so a section's title stays visible while scrolling
 * through its own (potentially long) checkbox list, and the chevron is a genuine group-open:
 * rotated indicator rather than relying on the browser's own default <summary> marker — which a
 * `display: flex` summary (needed for the refresh-interval <select> to sit on the same row) loses
 * entirely, since that marker only renders when a <summary>'s computed display is list-item. */
const SUMMARY_CLASS =
  "bg-card sticky top-0 z-10 flex cursor-pointer items-center justify-between gap-2 py-1 text-sm font-medium";

interface ActivePanel {
  kind: InfoPanelKind;
  key: string | null;
  label: string;
  docsUrl: string | null;
}

interface RefreshIntervalOption {
  label: string;
  value: string;
}

/** Encoded as strings for the native <select> — "off" for "Do not refresh" (null), otherwise the
 * interval in milliseconds. */
const REFRESH_INTERVAL_OPTIONS: RefreshIntervalOption[] = [
  { label: "10s", value: "10000" },
  { label: "30s", value: "30000" },
  { label: "1 min", value: "60000" },
  { label: "2 min", value: "120000" },
  { label: "5 min", value: "300000" },
  { label: "Never", value: "off" },
];

function refreshIntervalToOptionValue(ms: RefreshIntervalMs): string {
  return ms == null ? "off" : String(ms);
}

function optionValueToRefreshInterval(value: string): RefreshIntervalMs {
  return value === "off" ? null : Number(value);
}

function sortedByLabel(checkboxes: LayerCheckbox[]): LayerCheckbox[] {
  return [...checkboxes].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The actual Realtime/Route/Stops checkbox lists + Apply button — split out of
 * StatusCardComponent so the identical content can be hosted in two different pieces of chrome:
 * the desktop floating card (StatusCardComponent) and the mobile bottom sheet
 * (MobileLayerSheetComponent). No behavior lives here beyond what StatusCardComponent already
 * had; only the outer card/sheet framing differs per host.
 *
 * Every realtime row reserves the same fixed-size slot (`size-7`, matching CountdownRingComponent
 * exactly) for whichever of "nothing yet / indeterminate spinner while first loading / countdown
 * ring / red error ring" currently applies — so a row's height, and the alignment of the info
 * link past it, never shifts depending on that source's state. The slot's contents are always
 * right-aligned before the info link, which is why it sits in its own flex item rather than
 * inline after the label.
 */
@Component({
  selector: "app-layer-checklist",
  imports: [HlmButton, HlmCheckbox, CountdownRingComponent, TrackerInfoPanelComponent],
  template: `
    <div class="flex min-h-full flex-1 flex-col gap-4">
      <details open class="group">
        <summary [class]="SUMMARY_CLASS">
          <span class="flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              class="text-muted-foreground size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            Realtime layer
            @if (layerSelection.realtimeCount() > 0) {
              <span
                class="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-normal tabular-nums"
              >
                {{ layerSelection.realtimeCount() }}
              </span>
            }
          </span>
          <!-- click stops here so interacting with the dropdown doesn't also toggle
                         this <details> closed — a native <summary> treats any click inside it as
                         "toggle open/closed" by default. -->
          <select
            class="border-input bg-background rounded-md border px-1.5 py-1 text-xs font-normal"
            (click)="$event.stopPropagation()"
            (change)="onRefreshIntervalChange($event)"
          >
            <!-- [selected] per-option (not [value] on the <select> itself): a value
                             binding set before @for has populated any <option> elements yet
                             silently falls back to the browser's own default (the first option)
                             and never gets reconciled afterward, since Angular only re-applies a
                             property binding when its own bound expression changes, not merely
                             when new DOM appears under it. -->
            @for (option of refreshIntervalOptions; track option.value) {
              <option
                [value]="option.value"
                [selected]="option.value === refreshIntervalOptionValue()"
              >
                {{ option.label }}
              </option>
            }
          </select>
        </summary>
        <ul class="mt-2 flex flex-col gap-2">
          @for (checkbox of realtimeCheckboxes; track checkbox.value) {
            <li class="relative flex items-center justify-between gap-2 text-sm">
              <label class="flex min-w-0 items-center gap-2">
                <hlm-checkbox
                  [checked]="!!layerSelection.realtimeChecked()[checkbox.value]"
                  (checkedChange)="layerSelection.toggleRealtime(checkbox.value)"
                />
                <!-- Full label, wrapping rather than clipping — up to a generous
                                     80ch cap (every real label today is well under that; this is
                                     just a ceiling so a future long one wraps instead of silently
                                     overflowing the fixed-width panel). Previously used a truncate
                                     class (overflow-hidden + ellipsis), which cut labels off outright. -->
                <span class="max-w-[80ch] min-w-0 break-words">{{ checkbox.label }}</span>
              </label>

              <div class="flex shrink-0 items-center gap-1.5">
                <!-- Fixed-size slot — always rendered, contents vary — so this
                                     row's height never shifts when a spinner/ring appears. -->
                <span class="inline-flex size-7 items-center justify-center">
                  @if (gtfsRealtime.sources()[checkbox.value]; as source) {
                    @if (!source.hasLoadedOnce()) {
                      <!-- Reverse indeterminate spinner: still "something is
                                                 happening", but explicitly not the depleting
                                                 countdown ring, which has nothing to count down
                                                 from until the first fetch actually resolves. -->
                      <svg
                        class="text-muted-foreground size-3.5 [animation-direction:reverse]"
                        style="animation: spin 1s linear infinite"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-opacity="0.25"
                        />
                        <path
                          d="M21 12a9 9 0 0 0-9-9"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                        />
                      </svg>
                    } @else if (source.hasError()) {
                      <!-- No live seconds in this label (unlike the visual
                                                 ring's own hover tooltip) — deliberately: a value
                                                 that changes every 100ms has nothing meaningful to
                                                 add for assistive tech (it's not re-announced on
                                                 every tick anyway, only when focus/hover changes),
                                                 and reading it *here* would re-introduce exactly
                                                 the every-tick-re-renders-the-whole-list cost this
                                                 component's own doc comment now explains. -->
                      <button
                        type="button"
                        class="contents"
                        aria-label="Realtime feed error — retrying, click for details"
                        (click)="
                          openErrorKey.set(
                            openErrorKey() === checkbox.value ? null : checkbox.value
                          )
                        "
                      >
                        <app-countdown-ring [source]="source" [error]="true" />
                      </button>
                    } @else {
                      <app-countdown-ring [source]="source" />
                    }
                  }
                </span>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground"
                  title="Feed info"
                  [attr.aria-label]="checkbox.label + ' — feed info'"
                  (click)="openPanel('realtime', checkbox.value, checkbox.label, checkbox.source)"
                >
                  ⓘ
                </button>
              </div>

              @if (openErrorKey() === checkbox.value) {
                <div
                  class="bg-popover text-popover-foreground border-border absolute top-full right-0 z-30 mt-1.5 w-64 rounded-lg border p-3 text-xs shadow-md"
                >
                  <p class="mb-1 font-medium">{{ checkbox.label }} — feed unreachable</p>
                  <p class="text-muted-foreground mb-2 break-words">
                    {{
                      gtfsRealtime.sources()[checkbox.value]?.lastErrorMessage() ?? "Unknown error"
                    }}
                  </p>
                  <div class="flex items-center gap-2">
                    <button hlmBtn size="sm" (click)="onRetryNow(checkbox.value)">Try now</button>
                    <button hlmBtn size="sm" variant="ghost" (click)="openErrorKey.set(null)">
                      Close
                    </button>
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      </details>

      <details class="group">
        <summary [class]="SUMMARY_CLASS">
          <span class="flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              class="text-muted-foreground size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            Route layer
          </span>
          @if (layerSelection.railwayCount() > 0) {
            <span
              class="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-normal tabular-nums"
            >
              {{ layerSelection.railwayCount() }}
            </span>
          }
        </summary>
        <ul class="mt-2 flex flex-col gap-2">
          <li class="flex items-center justify-between gap-2 text-sm">
            <label class="flex min-w-0 items-center gap-2">
              <hlm-checkbox
                [checked]="layerSelection.railwayChecked()"
                (checkedChange)="layerSelection.toggleRailway()"
              />
              <span class="max-w-[80ch] min-w-0 break-words">{{ railwaySource.label }}</span>
            </label>
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground shrink-0"
              title="Layer info"
              [attr.aria-label]="railwaySource.label + ' — layer info'"
              (click)="openPanel('railway', null, railwaySource.label, railwaySource.source)"
            >
              ⓘ
            </button>
          </li>
        </ul>
      </details>

      <!-- mt-auto: the last category — when the two above it don't fill the panel's own
                 fixed height (see StatusCardComponent's h-[60vh], a real height rather than a
                 max-height specifically so this leftover space exists), this pushes the group down
                 to sit flush against the panel's bottom edge instead of floating directly beneath
                 Route layer with a gap of empty space below it. Ordinary flex-column behavior — no
                 sticky/JS needed, since there's nothing to "hand off" between here; once the
                 checklist's total content is taller than the panel, mt-auto has no free space left
                 to act on and this row falls back to plain in-flow stacking. -->
      <details class="group mt-auto">
        <summary [class]="SUMMARY_CLASS">
          <span class="flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              class="text-muted-foreground size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            Stops layer
          </span>
          @if (layerSelection.stopsCount() > 0) {
            <span
              class="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-normal tabular-nums"
            >
              {{ layerSelection.stopsCount() }}
            </span>
          }
        </summary>
        <ul class="mt-2 flex flex-col gap-2">
          @for (checkbox of stopsCheckboxes; track checkbox.value) {
            <li class="flex items-center justify-between gap-2 text-sm">
              <label class="flex min-w-0 items-center gap-2">
                <hlm-checkbox
                  [checked]="!!layerSelection.stopsChecked()[checkbox.value]"
                  (checkedChange)="layerSelection.toggleStops(checkbox.value)"
                />
                <span class="max-w-[80ch] min-w-0 break-words">{{ checkbox.label }}</span>
              </label>
              @if (gtfsStatic.sources()[checkbox.value]?.isLoading()) {
                <svg
                  class="text-muted-foreground size-3.5 shrink-0 [animation-direction:reverse]"
                  style="animation: spin 1s linear infinite"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-label="Loading"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-opacity="0.25"
                  />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              }
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground shrink-0"
                title="Layer info"
                [attr.aria-label]="checkbox.label + ' — layer info'"
                (click)="openPanel('stops', checkbox.value, checkbox.label, checkbox.source)"
              >
                ⓘ
              </button>
            </li>
          }
        </ul>
      </details>

      <app-tracker-info-panel
        [open]="activePanel() !== null"
        (openChange)="onPanelOpenChange($event)"
        [kind]="activePanel()?.kind ?? 'realtime'"
        [sourceKey]="activePanel()?.key ?? null"
        [label]="activePanel()?.label ?? ''"
        [docsUrl]="activePanel()?.docsUrl ?? null"
      />
    </div>
  `,
})
export class LayerChecklistComponent {
  protected readonly layerSelection = inject(LayerSelectionService);
  protected readonly gtfsRealtime = inject(GtfsRealtimeService);
  protected readonly gtfsStatic = inject(GtfsStaticService);

  protected readonly SUMMARY_CLASS = SUMMARY_CLASS;
  protected readonly realtimeCheckboxes = sortedByLabel(REALTIME_LAYER_CHECKBOXES);
  protected readonly stopsCheckboxes = sortedByLabel(STOPS_LAYER_CHECKBOXES);
  protected readonly railwaySource = RAILWAY_LINE_SOURCE;
  protected readonly refreshIntervalOptions = REFRESH_INTERVAL_OPTIONS;

  /** Which row's info panel is open, if any — at most one at a time, same as `openErrorKey`. */
  protected readonly activePanel = signal<ActivePanel | null>(null);

  protected openPanel(
    kind: InfoPanelKind,
    key: string | null,
    label: string,
    docsUrl: string,
  ): void {
    this.activePanel.set({ kind, key, label, docsUrl });
  }

  protected onPanelOpenChange(open: boolean): void {
    if (!open) {
      this.activePanel.set(null);
    }
  }

  /** Which realtime row's error-detail panel is open, if any — at most one at a time. */
  protected readonly openErrorKey = signal<string | null>(null);

  protected readonly refreshIntervalOptionValue = computed(() =>
    refreshIntervalToOptionValue(this.gtfsRealtime.refreshIntervalMs()),
  );

  protected onRefreshIntervalChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.gtfsRealtime.setRefreshInterval(optionValueToRefreshInterval(value));
  }

  protected onRetryNow(key: string): void {
    this.gtfsRealtime.sources()[key]?.retryNow();
    this.openErrorKey.set(null);
  }
}
