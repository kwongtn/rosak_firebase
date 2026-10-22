import { Component, computed, inject, input } from "@angular/core";
import { RouterLink } from "@angular/router";

import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import { HlmBadge } from "../../../ui/badge/badge";
import type { BadgeVariants } from "../../../ui/badge/badge";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import { HomeStore } from "../data/home.store";
import {
  incidentDayKey,
  incidentDayLabel,
  incidentSeverityLabel,
  incidentSeverityVariant,
  pickLineChips,
} from "../data/incident-notices.util";
import type { LineChip } from "../data/incident-notices.util";

/** What the template draws for one chip. Built in one computed so the template only binds. */
interface ChipView {
  key: string;
  kind: LineChip["kind"];
  title: string;
  /** `routerLink` commands: the calendar day the incident starts on, or the calendar's own landing
   *  day when the datetime cannot be read (a wrong day would be worse than today). */
  link: string[];
  /** Notice only: the severity's badge colour and its word. */
  variant: BadgeVariants["variant"];
  severityLabel: string;
  /** Planned works only: the start day, written like the rest of the board (`Sat 25 Oct`). */
  dateLabel: string | null;
}

function chipView(chip: LineChip): ChipView {
  const { incident } = chip;
  const dayKey = incidentDayKey(incident.startDatetime);
  const dateLabel = chip.kind === "planned" ? incidentDayLabel(incident.startDatetime) : null;
  return {
    key: `${chip.kind}:${incident.id}`,
    kind: chip.kind,
    title: incident.title,
    link: dayKey ? ["/insiden", dayKey] : ["/insiden"],
    variant: incidentSeverityVariant(incident.severity),
    severityLabel: incidentSeverityLabel(incident.severity),
    dateLabel,
  };
}

/**
 * The incident chips under one line on the network board: a **Notice** for each approved incident
 * running on the line now, and — when asked — a **Planned works** chip for each one starting within
 * the next week. Drawn by both board rows (`app-line-pulse-row`, `app-line-pulse-card`).
 *
 * 🔴 **It reads the store, and draws nothing until the store has an answer.** `noticesFor` /
 * `plannedWorksFor` answer an empty list while a read is loading and when it failed, and an empty
 * list renders no element at all — no skeleton, no placeholder, no gap (the host is `empty:hidden`,
 * so a parent's `gap` or margin cannot leave a hole either). A row must not announce "loading
 * notices" for something most lines never have, and a failed supporting read must not cost the
 * reader the row. Which reads exist at all is the board's decision (it opts them in), not this
 * component's.
 *
 * `planned` is the caller's decision too: the Planned works read is for the lines a rider pinned, so
 * the row passes its own pin state and the card passes nothing.
 *
 * At most `MAX_LINE_CHIPS` chips are drawn, Notices first (`pickLineChips`); a "+N" link to the
 * calendar covers the rest. Each chip links to `/insiden/<day it starts>`. The day comes from the
 * backend's offset-free datetime STRING, never from a `Date`, so the server render and the hydrated
 * page produce the same href.
 *
 * Severity is a colour AND a word, and every word on a chip is part of the link's accessible name.
 * 🔴 **The links carry no `aria-label`.** An override replaces the content as the name, so it could
 * only drop or reorder the visible words, and a voice-control user who says "click Major" would reach
 * nothing (WCAG 2.5.3, label in name). The name is the visible text itself: `Notice Major <title>`,
 * `Planned works Sat 25 Oct <title>`. The strip is named by its line (`lineName`), so the same words on
 * sixteen rows still say which line they are about.
 */
@Component({
  selector: "app-line-notices",
  imports: [HlmBadge, InfoPopover, RouterLink],
  host: { class: "block empty:hidden" },
  template: `
    @if (_view().chips.length > 0) {
      <!-- A chip is capped at the strip's width minus the trailing info glyph (16px + gap), so a long
           title truncates instead of pushing the glyph alone onto its own line on a phone. -->
      <ul
        class="flex flex-wrap items-center gap-1.5"
        [attr.aria-label]="'Incidents on ' + lineName()"
        data-testid="line-notices"
      >
        @for (chip of _view().chips; track chip.key) {
          <li class="flex max-w-[calc(100%-1.75rem)] min-w-0">
            @if (chip.kind === "notice") {
              <a
                hlmBadge
                [variant]="chip.variant"
                class="focus-visible:ring-ring/50 max-w-full gap-1.5 py-1 underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                [routerLink]="chip.link"
                data-testid="line-notice"
              >
                <span class="font-semibold">Notice</span>
                <span class="font-normal opacity-80" data-testid="line-notice-severity">{{
                  chip.severityLabel
                }}</span>
                <span
                  class="min-w-0 truncate"
                  [attr.title]="chip.title"
                  data-testid="line-notice-title"
                  >{{ chip.title }}</span
                >
              </a>
            } @else {
              <a
                hlmBadge
                variant="outline"
                class="focus-visible:ring-ring/50 max-w-full gap-1.5 py-1 underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                [routerLink]="chip.link"
                data-testid="line-planned"
              >
                <span class="font-semibold">Planned works</span>
                @if (chip.dateLabel; as date) {
                  <span
                    class="font-normal tabular-nums opacity-80"
                    data-testid="line-planned-date"
                    >{{ date }}</span
                  >
                }
                <span
                  class="min-w-0 truncate font-normal"
                  [attr.title]="chip.title"
                  data-testid="line-planned-title"
                  >{{ chip.title }}</span
                >
              </a>
            }
          </li>
        }
        @if (_view().more > 0) {
          <li class="flex">
            <a
              hlmBadge
              variant="outline"
              class="focus-visible:ring-ring/50 py-1 outline-none hover:underline focus-visible:ring-2"
              routerLink="/insiden"
              [attr.aria-label]="'+' + _view().more + ' more on the incident calendar'"
              data-testid="line-notices-more"
              >+{{ _view().more }}</a
            >
          </li>
        }
        <li class="flex">
          <app-info-popover
            label="Notices and planned works"
            [content]="_info"
            [showMethodologyLink]="false"
            testId="line-notices-popover"
          ></app-info-popover>
        </li>
      </ul>
    }
  `,
})
export class LineNoticesComponent {
  /** The line whose chips to draw. */
  readonly lineId = input.required<string>();
  /** The line's display name: it names the strip, so a screen reader knows whose incidents these are. */
  readonly lineName = input.required<string>();
  /** Whether this line also draws its Planned works. The row passes its pin state. */
  readonly planned = input(false);

  private readonly store = inject(HomeStore);

  /** The popover's copy: the registry's tooltip-sized text, so the chips and /methodology agree. */
  protected readonly _info = metricTooltip("incidents.line-notices");

  protected readonly _view = computed(() => {
    const lineId = this.lineId();
    const { chips, more } = pickLineChips(
      this.store.noticesFor(lineId),
      this.planned() ? this.store.plannedWorksFor(lineId) : [],
    );
    return { chips: chips.map(chipView), more };
  });
}
