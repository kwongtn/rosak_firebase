/**
 * One anchored section of the `/methodology` page. Its prose lives here, its numbers (if any)
 * come from `{{TOKEN}}`s resolved through `renderMethodologyCopy()` — never typed inline.
 */
export interface MethodologySection {
  /** Anchor id, deep-linked from every info popover: `/methodology#<id>`. */
  id: string;
  /** Heading text. */
  title: string;
  /** One short sentence naming the owning spec; may contain `{{TOKENS}}`. */
  body: string;
  /** Feature route this section links to, or `null` when no route owns it yet. */
  ownerRoute: string | null;
  /** The sibling spec file that owns this section's substance. */
  sourceSpec: string;
  /** ISO date, bumped when the owning rule changes. */
  lastReviewed: string;
  /** True while the owning spec's code (not just its prose) has not landed. */
  inProgress: boolean;
}

/**
 * A precise, reusable definition of one non-obvious metric. The page and every info popover
 * read this same string, so the two can never disagree.
 */
export interface MetricDoc {
  /** Stable key, e.g. `line-status.active`. */
  id: string;
  /** Must match a `MethodologySection.id`. */
  sectionId: string;
  /** Label shown above the definition. */
  title: string;
  /** One precise paragraph; may contain `{{TOKENS}}`. */
  definition: string;
  /** Feature route this metric belongs to, or `null` when no route owns it yet. */
  ownerRoute: string | null;
  /** The sibling spec file that owns this metric's substance. */
  sourceSpec: string;
  /** ISO date, bumped when the owning rule changes. */
  lastReviewed: string;
}

/** The date every v1 entry was last checked against its owning spec. */
const REVIEWED_AT_SHIP = "2026-09-24";

/** Bumped when the network board's headline metrics landed on the front page (2026-10-03). */
const REVIEWED_AT_NETWORK_BOARD = "2026-10-03";

/**
 * Bumped when the service-day history widgets landed — the hero's sparkline, the board's per-line
 * strips and the Pro heat grid (2026-10-03).
 *
 * A separate constant from `REVIEWED_AT_NETWORK_BOARD` on purpose even though both currently hold
 * the same date: these are a DIFFERENT review of the same section (the hour-bucket contract rather
 * than the live-status rules), and collapsing them would make the next bump on one silently claim a
 * review of the other.
 */
const REVIEWED_AT_HISTORY_WIDGETS = "2026-10-03";

/**
 * Bumped when the Pro bento dashboard shipped — its three board filters, the feed's three filter axes
 * and the CSV export (2026-10-03).
 *
 * A separate constant from the two above rather than a reuse of either: the one user-visible rule this
 * phase adds is "which lines do we say we have data about", which is a DIFFERENT review from the
 * confidence chip's levels (already shipped, describing the same evidence from the chip's side) and
 * from the service-day shapes (an entirely different set of widgets). Sharing a constant would make a
 * later bump on any one of the three silently claim a review of the other two.
 */
const REVIEWED_AT_PRO_DASHBOARD = "2026-10-03";

/**
 * Bumped when the Pro dashboard's OFFICIAL-NOTICES ARCHIVE and WORST-LINES RANKING landed — the two
 * supporting widgets that added a rule rather than a view of an existing one (2026-10-03).
 *
 * A fourth constant rather than a reuse of the three above, for the same reason each of them is
 * separate: the archive's window is a deliberate NON-window, and the ranking's is a service-day total
 * that is explicitly reports and not faults. Both are reviews of the `line-status` section's
 * substance that none of the earlier reviews would have covered, so sharing a constant would let the
 * next bump on any of the four silently claim a review of the other three.
 */
const REVIEWED_AT_PRO_OFFICIAL_WIDGETS = "2026-10-03";

/**
 * Bumped by the Phase 5B registry audit, which walked every number the front page actually ships
 * and asked the one question that matters — is it defined, and can a reader reach that definition?
 * (2026-10-03).
 *
 * It found one gap (`network.reports-now` shipped since the board landed with no `MetricDoc` at all)
 * and two rules that had a definition nobody could reach in situ. Both are now surfaced from the
 * hero. Only the `line-status` section is bumped: every one of these metrics lives there, and no
 * other section's substance was re-read (the `passenger.*` chips were checked for a SURFACE only, so
 * `sightings` keeps its ship date rather than claiming a review nobody did).
 */
const REVIEWED_AT_POLISH = "2026-10-03";

/**
 * Bumped when the front page's headline and tone were re-scoped to IN-SERVICE lines — closed
 * (Defunct) and pre-opening (Testing) lines no longer count in “N of M lines running normally”,
 * and the indicator's colour follows the same counts (2026-10-05).
 */
const REVIEWED_AT_HEADLINE_IN_SERVICE = "2026-10-05";

/**
 * The eight anchored sections of the page, in render order. Every one is `inProgress: true`:
 * the owning specs' prose has landed but their code has not, so each renders the "in progress"
 * state (naming its spec) rather than any number (METHODOLOGY_DOCS.md lines 31–32, 259–264).
 * `ownerRoute` is `null` where no route exists — `reliability`'s `/review` route is not created
 * by this work.
 */
export const METHODOLOGY_SECTIONS: MethodologySection[] = [
  {
    id: "sources",
    title: "Where the data comes from",
    body: "Where each datum comes from is owned by DATA_PROVENANCE.md; this section renders once that registry ships.",
    ownerRoute: "/insiden",
    sourceSpec: "DATA_PROVENANCE.md",
    lastReviewed: REVIEWED_AT_SHIP,
    inProgress: true,
  },
  {
    id: "reliability",
    title: "Reliability & monthly review",
    body: "How the reliability score is computed is owned by MONTHLY_REVIEW.md; this section renders once that rule ships.",
    ownerRoute: null,
    sourceSpec: "MONTHLY_REVIEW.md",
    lastReviewed: REVIEWED_AT_SHIP,
    inProgress: true,
  },
  {
    id: "episodes",
    title: "Disruptions, episodes & clocks",
    body: "What counts as one disruption episode is owned by INCIDENT_EPISODES.md; this section renders once that rule ships.",
    ownerRoute: "/insiden",
    sourceSpec: "INCIDENT_EPISODES.md",
    lastReviewed: REVIEWED_AT_SHIP,
    inProgress: true,
  },
  {
    id: "line-status",
    title: "How line status is derived",
    body: "How line status is derived is owned by LINE_STATUS_DERIVE.md; this section renders once that rule ships.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    // Bumped by the Phase 5B registry audit — the Pro dashboard's two supporting widgets added the
    // ranking and the archive, and the audit then checked every shipped number on the front page for
    // a definition and a reachable one. Every metric on this page belongs to this section, so the
    // section is what was reviewed.
    lastReviewed: REVIEWED_AT_POLISH,
    inProgress: true,
  },
  {
    id: "sightings",
    title: "Rider sightings & community reports",
    body: "How rider sightings are aggregated is owned by LINE_STATUS_DERIVE.md; this section renders once that rule ships.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
    inProgress: true,
  },
  {
    id: "arrivals",
    title: "Arrivals: scheduled vs live",
    body: "How arrivals are scheduled versus live is owned by NEXT_TRAIN_ARRIVALS.md; this section renders once that rule ships.",
    ownerRoute: "/tracker",
    sourceSpec: "NEXT_TRAIN_ARRIVALS.md",
    lastReviewed: REVIEWED_AT_SHIP,
    inProgress: true,
  },
  {
    id: "moderation",
    title: "Moderation & approval rules",
    body: "Moderation and approval rules are owned by PLATFORM_HYGIENE.md; this section renders once that rule ships.",
    ownerRoute: "/console",
    sourceSpec: "PLATFORM_HYGIENE.md",
    lastReviewed: REVIEWED_AT_SHIP,
    inProgress: true,
  },
  {
    id: "limitations",
    title: "Known limitations",
    body: "What these numbers cannot tell you is owned by DATA_PROVENANCE.md; this section renders once that registry ships.",
    ownerRoute: null,
    sourceSpec: "DATA_PROVENANCE.md",
    lastReviewed: REVIEWED_AT_SHIP,
    inProgress: true,
  },
];

/**
 * The metrics with a real, human-readable definition today. The strings are the existing home
 * registries' copy folded in — `LINE_STATUS_INFO` / `PASSENGER_INFO`
 * (`features/home/data/status-info.util.ts`), `PASSENGER_METRIC`
 * (`features/home/data/line-status-metrics.util.ts`) and the line-pulse vehicle-count popover
 * (`features/home/line-pulse/line-pulse-card.component.ts`). They are copied, not imported,
 * because `core/` must not depend on a feature. Vehicle-status labels (the breakdown rows) and
 * other unlanded specs carry no definition yet, so they are deliberately absent (never invent a
 * formula).
 */
export const METRIC_DOCS: MetricDoc[] = [
  {
    id: "line-status.testing",
    sectionId: "line-status",
    title: "Testing",
    definition: "The line is under test — service is not fully open to the public yet.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "line-status.defunct",
    sectionId: "line-status",
    title: "Defunct",
    definition: "This line is no longer in service.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "line-status.active",
    sectionId: "line-status",
    title: "Active",
    definition: "The line is fully operational.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "line-status.partial_active",
    sectionId: "line-status",
    title: "Partially Active",
    definition: "Only part of the line is open — some stations are skipped or closed.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "line-status.partial_disruption",
    sectionId: "line-status",
    title: "Partial Disruption",
    definition: "Part of the line is disrupted; expect delays or detours.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "line-status.total_disruption",
    sectionId: "line-status",
    title: "Total Disruption",
    definition: "The line is not running — use an alternative route.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "line-pulse.vehicle-count",
    sectionId: "line-status",
    title: "Vehicles",
    definition: "Vehicles in service right now.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "passenger.normal",
    sectionId: "sightings",
    title: "Normal",
    definition: "Seats available — you can sit.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "passenger.busy",
    sectionId: "sightings",
    title: "Busy",
    definition: "Can board the first train — standing, but you have space.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "passenger.crowded",
    sectionId: "sightings",
    title: "Crowded",
    definition: "Standing room only — board after 1–2 trains.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "passenger.extremely_crowded",
    sectionId: "sightings",
    title: "Extremely Crowded",
    definition: "Unable to board — board after 3+ trains.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "passenger.backlogged",
    sectionId: "sightings",
    title: "Backlogged",
    definition: "Long gap since last train — platform filling up.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "passenger.delayed",
    sectionId: "sightings",
    title: "Delayed",
    definition: "Trains running 10–15 min late.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    id: "passenger.disrupted",
    sectionId: "sightings",
    title: "Disrupted",
    definition: "Service suspended — use an alternative route.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SHIP,
  },
  {
    // The front page's own headline metric — features/home/hero/home-hero.component.ts reads it
    // through the hero's InfoPopover. Registered here so the number in the tile and the sentence
    // on /methodology can never be phrased differently. It documents the IN-SERVICE scoping AND the
    // tone's rule because both are what a reader sees above the fold, from one definition: the words
    // and the colour are read off the same two counts, so describing one and not the other would
    // leave half the visible metric undefined.
    id: "network.lines-normal",
    sectionId: "line-status",
    title: "Lines running normally",
    definition:
      "A line counts as running normally when its operational status is Active and no rider has reported it Delayed or Disrupted in the current window. Closed (Defunct) and not-yet-open (Testing) lines are not in service, so they are not counted in the headline at all. The headline reads “N of M lines running normally” and its colour follows the same counts: green when every in-service line runs normally, orange when some need attention, red when more than half do.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_HEADLINE_IN_SERVICE,
  },
  {
    id: "network.needs-attention",
    sectionId: "line-status",
    title: "Needs attention",
    definition:
      "A line needs attention when it is not fully operational, or when a rider has reported it at passenger severity {{NEEDS_ATTENTION_PASSENGER_RANK}} or above (Delayed and above) in the current window. Crowding reports below that level describe one carriage rather than the service, so they do not count against the line.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_NETWORK_BOARD,
  },
  {
    // 🔴 The one tile the Phase 5B registry audit found MISSING: "Reports now" has been on the hero
    // since the board shipped, is a number a reader is expected to weigh ("is anyone else seeing
    // this?"), and had no definition anywhere — so its two real caveats lived only in a code
    // comment. Registered here and surfaced by the tile label's own info popover
    // (features/home/hero/home-hero.component.ts).
    //
    // It needs no METHODOLOGY_CONSTANTS token: the window is the BACKEND's per-line
    // `statusWindowMinutes`, varying line to line, so there is no single frontend number to pin.
    // That variability IS the definition — see the double-counting caveat below.
    id: "network.reports-now",
    sectionId: "line-status",
    title: "Reports now",
    definition:
      "How many rider status reports the network's lines have received inside their own current windows. Each line's window is set by the backend and can differ between lines, so this is a sum of per-line counts rather than a count of distinct reporters: one rider who filed about two lines contributes two. It counts REPORTS and not problems — the same rider can file twice, and a report can describe crowding that never reached the line's status. Read it as how much the community is currently saying, not as how many lines are affected; the count of affected lines is the “Needs attention” tile above.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_POLISH,
  },
  {
    id: "network.severity-order",
    sectionId: "line-status",
    title: "Worst line first",
    definition:
      "Lines needing attention are ordered by operational severity first — Total Disruption, then Partial Disruption, Partial Active, Defunct, Testing, Active — and by rider-reported severity second. Defunct and Testing sit below the partial states deliberately: they are settled facts a rider cannot act on, not something to wait out.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_NETWORK_BOARD,
  },
  /* ---- the board's CONFIDENCE chip (one MetricDoc per level, so a chip's popover explains the
     level the reader is actually looking at rather than one generic paragraph). The rule itself is
     `features/home/data/status-confidence.util.ts`; these strings are its published definition, and
     the util's spec pins the level ordering and the constant against them. ---- */
  {
    id: "status-confidence.official",
    sectionId: "line-status",
    title: "Official update",
    definition:
      "The operator itself has published an update for this line, so it is taken as stated rather than counted. An official post outranks every rider report: the operator said so, and a tally of rider reports is not stronger evidence than that.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_NETWORK_BOARD,
  },
  {
    id: "status-confidence.confirmed",
    sectionId: "line-status",
    title: "Confirmed",
    definition:
      "At least {{CONFIRMED_MIN_REPORTS}} riders reported this line inside its current reporting window, so the reading is corroborated by several people independently rather than resting on one of them.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_NETWORK_BOARD,
  },
  {
    id: "status-confidence.unconfirmed",
    sectionId: "line-status",
    title: "Unconfirmed",
    definition:
      "There is something to report — the line's operational status is not Active, or a rider reported a passenger status above Normal — but fewer than {{CONFIRMED_MIN_REPORTS}} reports back it. The count in the chip is how many there were, so an unconfirmed reading can be weighed rather than taken on trust.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_NETWORK_BOARD,
  },
  {
    id: "status-confidence.none",
    sectionId: "line-status",
    title: "No recent reports",
    definition:
      "Nothing points to a problem on this line right now: no rider reports in the current window, no rider-reported status above Normal, and the line itself is running normally. Absence of reports is not confirmation that service is good — it is only the absence of reports.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_NETWORK_BOARD,
  },
  /* ---- the SERVICE-DAY HISTORY widgets. Three surfaces draw the same 24 hourly buckets the backend
     buckets rider reports into, so all three definitions are registered here rather than authored in
     a template: the hero's sparkline, the compact row's mini strip and the Pro heat grid. The rule
     itself is `features/home/data/status-history-display.util.ts`. ---- */
  {
    // The hero's app-network-sparkline. 🔴 The NETWORK AGGREGATE is the whole point of this wording:
    // the read tallies EVERY line's reports into each hour, so a busy bar means "the network was
    // busy" and never "this line was busy" — a reader who misreads it as one line's history will
    // trust it about the wrong line.
    id: "network.activity-sparkline",
    sectionId: "line-status",
    title: "Network activity by hour",
    definition:
      "One bar per hour of the community service day, which runs from {{SERVICE_DAY_START_HOUR}}:00 to 02:00 — {{SERVICE_DAY_HOURS}} hours in total. A bar's height is how many rider status reports EVERY line on the network received in that hour, and its colour is the passenger status most of those reports gave. This is a network-wide count, not one line's: per-line history is shown on the line itself. An hour nobody reported anything about has no colour rather than a “normal” one, because silence is not evidence that service was good.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_HISTORY_WIDGETS,
  },
  {
    // The compact board row's app-line-history-strip.
    id: "network.line-history-strip",
    sectionId: "line-status",
    title: "A line's reports by hour",
    definition:
      "The same {{SERVICE_DAY_HOURS}}-hour service day as the network sparkline, narrowed to one line: each cell is how many riders reported THAT line in that hour, coloured by the status they gave. Its height is scaled to that line's own busiest hour, so a quiet line looks quiet — a shared network scale would make one busy hour flatten every other row. The strip is hidden rather than drawn empty when the line reported nothing during the service day, or when the data could not be read.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_HISTORY_WIDGETS,
  },
  {
    // The Pro board's app-network-heat-strip: the only widget here with TWO dimensions.
    id: "network.heat-strip",
    sectionId: "line-status",
    title: "The heat grid (Pro view)",
    definition:
      "One row per line and one column per hour of the {{SERVICE_DAY_HOURS}}-hour service day, for every line at once. Each cell carries TWO readings: the colour is the passenger status that dominated that line in that hour, and the strength is how many reports that was, across {{HEAT_INTENSITY_STEPS}} steps relative to the busiest cell on screen. Colour alone would say “disrupted” without saying whether one person noticed or sixty did, and the strength alone would say “busy” without saying what kind of busy. The strength is shared across every row on purpose — a per-line scale would make a line with two reports look as dark as a line with two hundred, which is the comparison this grid exists for.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_HISTORY_WIDGETS,
  },
  /* ---- the Pro board's "only lines with data" toggle. It is the ONE new judgement this phase
     shipped: the other two filters are exact values the reader typed (`status === PARTIAL_DISRUPTION`,
     `crowding >= DELAYED`), and the feed's three axes are a line id and a substring. This one asks the
     page which lines it knows anything about at all, so it has to be published like any other rule. ---- */
  {
    id: "network.has-data",
    sectionId: "line-status",
    title: "Which lines count as having data",
    definition:
      "A line counts as having data when at least one of these is true: a rider filed a status report about it inside its own rolling window; riders reported a passenger status worse than Normal for it; its operational status is anything other than Active; or one of its pulse links is an official post. A passenger status of Normal is NOT data on its own — it is the reading the backend returns when nothing notable was filed, so counting it would put “we have data” on every line on the network and make the filter remove nothing. This is the same evidence the confidence chip on every row already uses, which is why the chip and this filter can never disagree about a line.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_PRO_DASHBOARD,
  },
  {
    // 🔴 The one rule that is genuinely NEW in this widget: it counts REPORTS, and a report is not a
    // fault. Without the sentence a Pro reader would take "top of the list" to mean "broken", which is
    // the reading the board's own severity order — not this widget — exists to give. The cap is a
    // `{{TOKEN}}` rather than a word so the panel and this sentence cannot disagree about how many
    // lines are shown.
    id: "network.report-ranking",
    sectionId: "line-status",
    title: "Worst lines by reports",
    definition:
      "The busiest {{REPORT_RANKING_TOP_LINES}} lines of the current service day, ranked by how many rider status reports each one received across the {{SERVICE_DAY_HOURS}}-hour day, and each bar is that line's share of the busiest line on the list. It counts REPORTS and not faults: a line can top this list on a morning's worth of ordinary crowding complaints and still be running, and a broken line nobody has filed about does not appear at all. Only lines with at least one report are ranked, so a service day with no rider reports shows nothing rather than five empty bars, and lines with equal totals are ordered by line code so the list cannot reshuffle itself. The hour-by-hour detail behind these totals is the heat grid.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_PRO_OFFICIAL_WIDGETS,
  },
];
