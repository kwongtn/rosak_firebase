import { Signal, computed, inject, signal } from "@angular/core";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { PreferencesService } from "../../../core/preferences/preferences.service";
import { LinePulse } from "./home-board.queries";
import type { StatusConfidence } from "./status-confidence.util";
import { hasOfficialPulseLink, statusConfidence } from "./status-confidence.util";
import { StatusInfo, vehicleBreakdownRows, vehicleCountInfo } from "./status-info.util";

/**
 * The state the full `LinePulseCardComponent` and the compact `LinePulseRowComponent` share: the
 * expand toggle, the pin, the confidence rule and the fleet-count copy. One definition, so the two
 * surfaces of one line cannot spell the same fact two ways. Call it from a field initializer (it
 * injects `PreferencesService`).
 *
 * `panelIdPrefix` is the only per-surface difference. The expanded panel's id is scoped to the line
 * AND the surface, because the board mounts a card or a row per line (a pinned line can sit in two
 * row groups at once), and a bare id would put the same attribute on several panels so every toggle
 * resolved to whichever came first in the DOM.
 */
export function injectLinePulseView(line: Signal<LinePulse>, panelIdPrefix: string) {
  const preferences = inject(PreferencesService);

  const expanded = signal(false);
  const expandedPanelId = computed(() => `${panelIdPrefix}-${line().id}`);

  /** Reads the pin signal through a `computed`, so the pin button repaints on toggle. */
  const isPinned = computed(() => preferences.isPinned(line().id));

  /** The pin button's tooltip heading; the copy is a plain instruction, so it travels with state. */
  const pinHintTitle = computed(() => (isPinned() ? "Click to unpin" : "Click to pin"));

  /** The pin button's tooltip body — says what pinning does, and how to undo it. */
  const pinHint = computed(() =>
    isPinned()
      ? "Unpin this line to return it to its regular group on the board."
      : "Pin this line to keep it in My lines at the top of the board.",
  );

  /**
   * How much this line's reported status can be trusted. The rule (and its four levels) is the pure
   * `statusConfidence`, so the card and the compact row cannot spell the same evidence differently.
   */
  const confidence = computed<StatusConfidence>(() =>
    statusConfidence({
      reportCount: line().statusReportCount,
      passengerStatus: line().passengerStatus,
      status: line().status,
      hasOfficialPost: hasOfficialPulseLink(line().pulseLinks),
    }),
  );

  /**
   * The chip's popover copy, read from the methodology registry through the resolved level's own
   * `metricId` — so the panel explains the level actually on screen (an official post is explained
   * differently from a three-rider tally) and `/methodology` cannot drift from the chip.
   */
  const confidenceInfo = computed<StatusInfo>(() => {
    const doc = metricDoc(confidence().metricId);
    return { title: doc.title, body: renderMethodologyCopy(doc.definition) };
  });

  return {
    expanded,
    expandedPanelId,
    isPinned,
    pinHintTitle,
    pinHint,
    confidence,
    confidenceInfo,
    /** The fleet badge's popover: one registry definition, so "N/M in service" is explained one way
     * on every board surface. */
    vehicleCountInfo: computed<StatusInfo>(() => vehicleCountInfo()),
    vehicleCountLabel: computed(
      () => `${line().inServiceVehicleCount} of ${line().totalVehicleCount} vehicles in service`,
    ),
    vehicleBreakdown: computed(() => vehicleBreakdownRows(line().vehicleStatusCounts)),

    toggleExpanded(): void {
      const opening = !expanded();
      expanded.set(opening);
      if (opening) {
        // Opening the panel IS looking at this line, so it joins the recents list the board's later
        // "jump back to a line you were reading" affordance will read. Recorded on the OPEN edge
        // only, so collapsing does not push a line nobody is looking at any further up the list.
        preferences.pushRecentLine(line().id);
      }
    },

    togglePin(): void {
      preferences.togglePin(line().id);
    },
  };
}
