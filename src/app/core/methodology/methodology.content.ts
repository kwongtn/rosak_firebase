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
 * A precise, reusable definition of one non-obvious metric. `/methodology` reads `definition` in
 * full and every info popover reads the shorter `summary` (falling back to `definition`), both from
 * this one entry, so the two readers can never disagree about the rule.
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
  /**
   * Tooltip-sized precis of `definition` — the same rule in fewer words, for a popover panel rather
   * than the full page. Optional: a metric without one falls back to `definition` (see
   * `metricTooltip()`). May contain the same `{{TOKENS}}` as `definition`.
   */
  summary?: string;
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
const REVIEWED_AT_HISTORY_WIDGETS = "2026-10-06";

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

/** Bumped when the line-details mobile activity bar gained the In-Service share chip — a new
 *  surface for the `line-status` section's fleet counts (2026-10-06). Only `line-status` is
 *  bumped: the other sections' substance was not re-read. */
const REVIEWED_AT_SPOTTING_FLEET_CHIP = "2026-10-06";

/**
 * Bumped when the front page's Others bucket landed — out-of-service (Testing/Defunct) lines left
 * "Needs attention" for a board group of their own, and the hero's "Needs attention" tile and
 * callout became in-service scoped like the headline (2026-10-06).
 *
 * A separate constant from `REVIEWED_AT_HEADLINE_IN_SERVICE`: that review covered the SENTENCE and
 * its colour, while this one re-read the ATTENTION RULE itself and the tile that publishes it.
 * Sharing a constant would let a later bump on either silently claim a review of the other.
 */
const REVIEWED_AT_OTHERS_BUCKET = "2026-10-06";

/**
 * Bumped when the front page's eight metrics gained a tooltip-sized `summary` (2026-10-07) — the
 * `definition` each already published stays the full text on /methodology and the summary is what a
 * hover panel carries.
 *
 * A separate constant from the reviews above even though the underlying rules did not change: this
 * review asked a different question — is the published rule short enough to read in a tooltip? — and
 * folding it into an earlier date would let the next bump on either silently claim the other.
 */
const REVIEWED_AT_TOOLTIP_CONCISION = "2026-10-07";

/**
 * Bumped when the board's "N/M in service" badge got its own explanation: the vehicle-count metric
 * now says where both numbers come from, and the badge's popover opens on a visible info glyph
 * instead of only on the bare badge (2026-10-19). Only the `line-status` section and this metric are
 * bumped; the other sections were not re-read.
 */
const REVIEWED_AT_IN_SERVICE_BADGE = "2026-10-19";

/**
 * Bumped when the board gained its operator-family filter and the Pro dashboard its compact lines
 * table. Both introduce a rule the reader is asked to trust: lines grouped by code prefix (there is
 * no operator field to group by), and a last-report column that is the hour, not the minute (2026-10-19).
 */
const REVIEWED_AT_OPERATOR_AND_TABLE = "2026-10-19";

/**
 * Bumped when the own profile gained its Fleet progress card (2026-10-21): a new rule about
 * spotting data, "distinct vehicles you have logged, out of each line's whole fleet". Only the
 * `sightings` section is bumped, since that is where the rule is published; the other sections were
 * not re-read.
 */
const REVIEWED_AT_FLEET_PROGRESS = "2026-10-21";

/**
 * Bumped when `/insiden` gained its "Last 12 months" chart (2026-10-22). It publishes ONE new rule
 * to the `episodes` section: incidents are counted per month by their START month, approved (LIVE)
 * ones only. A constant of its own for the reason every one above has one — sharing a date with an
 * earlier review would let a later bump on either silently claim the other.
 */
const REVIEWED_AT_INCIDENT_HISTORY = "2026-10-22";

/**
 * Bumped when the line-status sheet gained its offline outbox (2026-10-22, UTC). It publishes ONE
 * new rule to the `line-status` section: a report saved while offline is dropped, not sent, once it
 * is older than its line's reporting window (`REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES` when the page
 * did not know that window). Its own constant for the same reason as every one above.
 */
const REVIEWED_AT_REPORT_OUTBOX = "2026-10-22";

/**
 * Bumped when the front page's board gained its Notice / Planned works chips (2026-10-22). They publish
 * ONE new rule to the `episodes` section: which incidents a line shows (approved ones only, running
 * now or starting within the planned-works window, at most a few per line). A constant of its own for
 * the reason every one above has one — sharing a date with an earlier review would let a later bump on
 * either silently claim the other.
 */
const REVIEWED_AT_LINE_NOTICES = "2026-10-22";

/**
 * Bumped when the station page (`/station/:id`) shipped (2026-10-22, UTC). It publishes TWO new rules:
 * which incidents a station lists (`episodes`: approved ones tagged with it, in effect now or the
 * newest of the rest) and which rider reports it shows (`line-status`: the ones that name it among
 * each serving line's newest). A constant of its own for the reason every one above has one.
 */
const REVIEWED_AT_STATION_PAGE = "2026-10-22";

/**
 * Bumped when the front page's pinned lines gained their alert bell (2026-10-22, UTC). It publishes
 * ONE new rule to the `episodes` section: which incidents send a web push alert, and the per-line
 * cooldown (`PUSH_ALERT_COOLDOWN_MINUTES`). A constant of its own for the same reason as every one
 * above.
 */
const REVIEWED_AT_PUSH_ALERTS = "2026-10-22";

/**
 * Bumped when a line's expanded panel gained its "Typical week" strip (2026-10-22, UTC). It publishes
 * ONE new rule to the `line-status` section: the status riders most often reported in each hour of each
 * service-day weekday over the last few weeks, with a slot that has too few reports left as "not enough
 * reports". Its own constant for the same reason as every one above.
 */
const REVIEWED_AT_WEEK_PROFILE = "2026-10-22";

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
    // Bumped for `/insiden`'s "Last 12 months" chart: the section now carries its first metric. Bumped
    // again for the front page board's Notice / Planned works chips (REVIEWED_AT_LINE_NOTICES), for
    // the station page's incident lists (REVIEWED_AT_STATION_PAGE), and for the line alerts' rule
    // (REVIEWED_AT_PUSH_ALERTS).
    lastReviewed: REVIEWED_AT_PUSH_ALERTS,
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
    // section is what was reviewed. Also bumped for the line-details In-Service share chip surface
    // and again when the front page's metrics gained a tooltip-sized summary, and when the vehicle
    // count's "in service" badge was explained (REVIEWED_AT_IN_SERVICE_BADGE), when the
    // line-status sheet's outbox published the queued-report expiry (REVIEWED_AT_REPORT_OUTBOX),
    // when the station page published which rider reports it shows (REVIEWED_AT_STATION_PAGE),
    // and when a line's expanded panel published its typical week (REVIEWED_AT_WEEK_PROFILE).
    lastReviewed: REVIEWED_AT_WEEK_PROFILE,
    inProgress: true,
  },
  {
    id: "sightings",
    title: "Rider sightings & community reports",
    body: "How rider sightings are aggregated is owned by LINE_STATUS_DERIVE.md; this section renders once that rule ships.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    // Bumped when the own profile's Fleet progress card was documented here (REVIEWED_AT_FLEET_PROGRESS).
    lastReviewed: REVIEWED_AT_FLEET_PROGRESS,
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
    id: "fleet.in-service-share",
    sectionId: "line-status",
    title: "In Service share",
    definition:
      "Vehicles in service right now, out of this line's total fleet across every vehicle type.",
    ownerRoute: "/spotting",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_SPOTTING_FLEET_CHIP,
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
    title: "In service",
    definition:
      "Vehicles in service right now, out of every vehicle assigned to this line. A vehicle counts as in service when its current recorded status is In Service. The total counts every assigned vehicle whatever its status, so it includes vehicles that are out of service, not yet spotted, or decommissioned.",
    summary:
      "Vehicles whose current recorded status is In Service, out of every vehicle assigned to this line.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_IN_SERVICE_BADGE,
  },
  {
    id: "line-status.operator-family",
    sectionId: "line-status",
    title: "Operator groups",
    definition:
      "Lines are grouped by the letters at the start of their line code, so KTM1 falls in KTM and KJL in KJL. The line data carries no operator field, so a group is a code prefix, not a named operator. A code with no letters is grouped as OTHER.",
    summary: "Grouped by the letters at the start of each line code, not by a named operator.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_OPERATOR_AND_TABLE,
  },
  {
    id: "line-status.last-report-hour",
    sectionId: "line-status",
    title: "Last report",
    definition:
      "The start of the most recent service hour in which this line had at least one community report, shown as an age. Reports are counted by the hour, so the time is to the hour, not the minute. Blank until the service-day history has loaded.",
    summary: "The most recent service hour with a report on this line, to the hour.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_OPERATOR_AND_TABLE,
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
    // The profile's Fleet progress card. It is the person's own collection, so it says what counts as
    // "spotted" (an entry, whatever status was recorded) and what the total is (the line's whole
    // roster, the same count as the board's "In service" denominator) instead of leaving a rider to
    // guess why 41 of 68 is not 41 of the trains running today.
    id: "fleet.progress",
    sectionId: "sightings",
    title: "Fleet progress",
    definition:
      "For each line, the number of distinct vehicles you have logged at least once, out of every vehicle assigned to that line. A vehicle counts as spotted once you have submitted any spotting entry for it, whatever status or place you recorded. A vehicle assigned to several lines counts toward each of them. The total counts every assigned vehicle whatever its status, so it includes vehicles that are out of service, not yet spotted by anyone, or decommissioned. Only lines with at least one vehicle you have logged are listed. Only you see this, and it is never part of a public profile.",
    summary:
      "Distinct vehicles you have logged on a line, out of every vehicle assigned to it, whatever its status. Only you see this.",
    ownerRoute: "/profile",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_FLEET_PROGRESS,
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
    summary:
      "A line runs normally when it is in service and no rider has reported it Delayed or Disrupted. Closed and not-yet-open lines are not in service, so they are not counted.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_TOOLTIP_CONCISION,
  },
  {
    id: "network.needs-attention",
    sectionId: "line-status",
    title: "Needs attention",
    definition:
      "A line needs attention when it is in service and not fully operational, or when a rider has reported it at passenger severity {{NEEDS_ATTENTION_PASSENGER_RANK}} or above (Delayed and above) in the current window. Closed (Defunct) and not-yet-open (Testing) lines never need attention — they are not in service, and the board lists them in its Others group instead. Crowding reports below that level describe one carriage rather than the service, so they do not count against the line.",
    summary:
      "A line needs attention when it is in service but not fully operational, or when a rider reported it at passenger severity {{NEEDS_ATTENTION_PASSENGER_RANK}} or above (Delayed and above). Closed and not-yet-open lines never need attention.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_TOOLTIP_CONCISION,
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
    summary:
      "All rider status reports the network's lines received inside their own current windows. It counts reports, not problems — one rider filing about two lines counts twice.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_TOOLTIP_CONCISION,
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
  /* ---- the SERVICE-DAY HISTORY surfaces. Three of them draw the same 24 hourly buckets the backend
     buckets rider reports into, so all three definitions are registered here rather than authored in
     a template: the hero's network sparkline, the compact row's report-count label and the Pro heat
     grid. The rule itself is `features/home/data/status-history-display.util.ts`. ---- */
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
    summary:
      "One bar per hour of the {{SERVICE_DAY_HOURS}}-hour service day ({{SERVICE_DAY_START_HOUR}}:00 to 02:00). It tallies every line's reports together, so a tall bar means the network was busy — not any one line.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_TOOLTIP_CONCISION,
  },
  {
    // The compact board row's report tally — "N reports (X this hour)". 🔴 The SENTENCE about what it
    // counts is the point: the line beside it is a rolling 15-minute window, and the one a reader
    // wants at a glance is the day so far. Without "it counts reports, not faults" the bracket reads
    // as a severity score and a busy-but-normal morning looks like a breakdown.
    id: "network.line-reports-summary",
    sectionId: "line-status",
    title: "A line's reports today",
    definition:
      "The first number is every rider status report this line received during the current community service day, which runs from {{SERVICE_DAY_START_HOUR}}:00 to 02:00 — {{SERVICE_DAY_HOURS}} hours in total. The number in brackets is how many of those arrived in the hour we are in, so a busy total can be told apart from a live one. It counts REPORTS and not faults: a line can collect a morning's worth of ordinary crowding reports and still be running normally. When this line has no reports in the service day, or the data could not be read, the row shows its own shorter reporting window instead and this label is not drawn at all.",
    summary:
      "Reports this line received during the {{SERVICE_DAY_HOURS}}-hour service day ({{SERVICE_DAY_START_HOUR}}:00 to 02:00); the number in brackets arrived in the current hour. It counts reports, not faults.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_TOOLTIP_CONCISION,
  },
  {
    // The Pro board's app-network-heat-strip: the only widget here with TWO dimensions.
    id: "network.heat-strip",
    sectionId: "line-status",
    title: "The heat grid (Pro view)",
    definition:
      "One row per line and one column per hour of the {{SERVICE_DAY_HOURS}}-hour service day, for every line at once. Each cell carries TWO readings: the colour is the passenger status that dominated that line in that hour, and the strength is how many reports that was, across {{HEAT_INTENSITY_STEPS}} steps relative to the busiest cell on screen. Colour alone would say “disrupted” without saying whether one person noticed or sixty did, and the strength alone would say “busy” without saying what kind of busy. The strength is shared across every row on purpose — a per-line scale would make a line with two reports look as dark as a line with two hundred, which is the comparison this grid exists for.",
    summary:
      "One row per line and one column per hour of the service day. Colour is the passenger status that dominated that line that hour; strength is the report count, across {{HEAT_INTENSITY_STEPS}} steps shared by every line so the rows can be compared.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_TOOLTIP_CONCISION,
  },
  {
    // The expanded line panel's `app-line-week-profile`. 🔴 Three things a rider cannot read off the
    // grid: the rows are SERVICE days (a 01:30 Tuesday report is in Monday's row, at its end), a grey
    // cell is "too few reports" and NOT "a good hour", and the colour is the most frequent status of
    // the reports behind it, not an average. The numbers are tokens so the sentence and the code that
    // sends the window and applies the threshold cannot disagree.
    id: "line-status.typical-week",
    sectionId: "line-status",
    title: "A line's typical week",
    definition:
      "For one line, the passenger status riders most often reported in each hour of each weekday over the last {{WEEK_PROFILE_WEEKS}} weeks. Each row is a weekday of the community service day, which runs from {{SERVICE_DAY_START_HOUR}}:00 to 02:00, so a report at 01:30 on a Tuesday is counted under Monday and appears at the end of Monday's row. A cell is coloured by the status most of its reports gave (the more severe status wins a tie). A cell with fewer than {{MIN_REPORTS_PER_WEEK_SLOT}} reports behind it is left grey and reads as not enough reports, because one or two riders are not a pattern. The window rolls, so it includes the current day so far. It counts reports and not faults, and a grey cell is the absence of reports, not proof that service was good.",
    summary:
      "The status riders most often reported in each hour of each weekday over the last {{WEEK_PROFILE_WEEKS}} weeks. Rows are service days ({{SERVICE_DAY_START_HOUR}}:00 to 02:00). Fewer than {{MIN_REPORTS_PER_WEEK_SLOT}} reports in an hour shows as not enough reports.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_WEEK_PROFILE,
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
    summary:
      "A line has data when a rider report arrived inside its own window, its reported passenger status is worse than Normal, its operational status is not Active, or one of its pulse links is an official post. A Normal passenger status alone is not data.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_TOOLTIP_CONCISION,
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
    summary:
      "The busiest {{REPORT_RANKING_TOP_LINES}} lines of the service day, ranked by how many reports each received; each bar is a share of the top line. It counts reports, not faults — a line can top this list on ordinary crowding complaints.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_TOOLTIP_CONCISION,
  },
  {
    // The line-status sheet's offline outbox (`core/offline/report-outbox.service.ts`), surfaced from
    // the sheet's "will send when you're back online" line. The backend stamps a report with the time
    // it ARRIVES and takes no client time, so a report that waited counts as fresh in the board's
    // window. The expiry BOUNDS that staleness (a late report can be up to one window old); it does
    // not prevent it. The window is named without its length on purpose: that length is the
    // backend's, per line, recorded with the report and never mirrored here. The one frontend number
    // is the fallback for a page that did not know the window.
    id: "line-status.queued-report-expiry",
    sectionId: "line-status",
    title: "Saved reports",
    definition:
      "When a line status report cannot reach the server, it is saved on this device and sent when the connection comes back. The server records a report at the moment it arrives, not when you wrote it, so a saved report is sent only while it is younger than its line's own reporting window, the window the backend sets for each line and the board counts its reports in ({{REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES}} minutes if the page did not know that window). After that it is dropped, and you are told if you are signed in to the account that saved it. The limit bounds how stale a late report can be but does not prevent it: a late report is counted from when it arrives, so it can describe conditions up to one window older than the board suggests. Each line keeps one saved report, and submitting again for the same line replaces it. A saved report is sent only for the account that wrote it.",
    summary:
      "A saved report is sent only while it is younger than its line's reporting window; then it is dropped. A late report still counts from when it arrives, so it can be up to one window old. A newer report for the same line replaces it.",
    ownerRoute: "/",
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_REPORT_OUTBOX,
  },
  /* ---- `/insiden`'s "Last 12 months" chart and "Export month" files. 🔴 The rule is "counted ONCE,
     in the month the incident STARTED", and only APPROVED (live) incidents: a three-day outage is one
     bar in one month, not a bar in each month it touched. It is what lets a month's bar reconcile
     with that month's export, which writes the same set. STOPGAP HOME: the section is `episodes` only
     because it is the one the incident route owns — these are incident RECORDS, not the "episodes"
     INCIDENT_EPISODES.md will define. Move both entries when that spec gives incident records a
     section of their own. ---- */
  {
    id: "incidents.monthly-by-severity",
    sectionId: "episodes",
    title: "Incidents per month by severity",
    definition:
      "How many community-reported incidents started in each calendar month, split into Major and Minor severity, for the 12 months ending at the month selected on the calendar. An incident is counted once, in the month it started, however long it lasted: one that began on 30 June and ran into July is a June incident only. Only approved (live) incidents are counted — drafts, reports still waiting for approval and rejected ones are left out — and incidents of other severity are not drawn. A month with no bar had no approved incident start in it; that is the absence of a report, not proof that service was good.",
    summary:
      "Approved incidents counted once, in the month they started, split into Major and Minor. Drafts, pending and rejected reports are left out.",
    ownerRoute: "/insiden",
    sourceSpec: "INCIDENT_EPISODES.md",
    lastReviewed: REVIEWED_AT_INCIDENT_HISTORY,
  },
  {
    // The Notice and Planned works chips on the front page's board
    // (features/home/line-pulse/line-notices.component.ts). 🔴 Two things a rider cannot read off a chip:
    // WHICH incidents get one (approved ones only — the incident list also holds drafts) and why a line
    // can show fewer chips than it has incidents (the cap and the "+N" link). It is an incident-RECORD
    // rule, so it sits with the other incident entries in the same stopgap section.
    id: "incidents.line-notices",
    sectionId: "episodes",
    title: "Notices and planned works on a line",
    definition:
      "A Notice is an approved (live) incident from the incident calendar that is tagged with this line and is running now: it has started and has not ended, or it has no end time yet. Planned works are approved incidents tagged with this line that start within the next {{PLANNED_WORKS_WINDOW_DAYS}} days; they are shown only for lines you have pinned. Drafts, reports still waiting for approval and rejected ones are never shown. A line shows at most {{LINE_NOTICE_MAX_CHIPS}} chips, Notices before Planned works, and “+N” opens the incident calendar for the rest. A chip opens the calendar on the day the incident starts. Incidents are tagged with lines by the people who report them and approved by moderators, so a Notice is a checked community report, not an operator announcement, and a line with no chip only means that no approved incident is tagged with it.",
    summary:
      "Approved incidents tagged with this line that are running now. Planned works, for pinned lines only, start within {{PLANNED_WORKS_WINDOW_DAYS}} days. At most {{LINE_NOTICE_MAX_CHIPS}} chips a line; “+N” opens the calendar.",
    ownerRoute: "/",
    sourceSpec: "INCIDENT_EPISODES.md",
    lastReviewed: REVIEWED_AT_LINE_NOTICES,
  },
  {
    id: "incidents.month-export",
    sectionId: "episodes",
    title: "Export month",
    definition:
      "What the two Export month files hold: the approved (live) incidents that started in the month shown on the calendar, narrowed by any line or severity filter you have switched on. An incident is in the file of the month it started in, however long it lasted: one that began on 30 June and ran into July is in June's file only, which is also how the Last 12 months chart counts it. Drafts, reports still waiting for approval and rejected ones are never exported, even though the page lists them behind its Pending Approval toggle, so the number on the button is the number of rows in the file. Only the incidents the page has loaded for that month are considered, and a filtered file carries its filter in its name (insiden-2026-10-kjl-major.csv) because a spreadsheet has nowhere else to say it.",
    summary:
      "Approved incidents that started in the month shown, narrowed by your filters. Drafts, pending and rejected reports are never exported.",
    ownerRoute: "/insiden",
    sourceSpec: "INCIDENT_EPISODES.md",
    lastReviewed: REVIEWED_AT_INCIDENT_HISTORY,
  },
  /* ---- the station page (`features/station/station.page.ts`). `ownerRoute` is null for both: the page
     lives at `/station/:id`, and there is no bare `/station` route for the registry to resolve. ---- */
  {
    // 🔴 What a rider cannot read off the two lists: WHICH incidents a station gets (approved ones
    // tagged with it; the incident list also holds drafts) and why "Recent" can hold a planned work
    // that has not started yet (it is everything not in effect now, newest start first). An incident
    // RECORD rule, so it sits with the other incident entries in the same stopgap section.
    id: "incidents.station",
    sectionId: "episodes",
    title: "Incidents at a station",
    definition:
      "A station's page lists approved (live) incidents from the incident calendar that are tagged with that station. In effect now lists the ones running now: they have started and have not ended, or they have no end time yet. Recent incidents lists the {{STATION_INCIDENT_HISTORY_LIMIT}} newest of the others by start time, so it can include planned works that have not started yet. Drafts, reports still waiting for approval and rejected ones are never shown. Stations are tagged by the people who report an incident and checked by moderators, so an incident that affected a station but was not tagged with it is not listed, and an empty list only means that no approved incident is tagged with the station.",
    summary:
      "Approved incidents tagged with this station. In effect now: started and not yet ended. Recent: the {{STATION_INCIDENT_HISTORY_LIMIT}} newest of the rest, which can include planned works. Drafts and pending reports are never shown.",
    ownerRoute: null,
    sourceSpec: "INCIDENT_EPISODES.md",
    lastReviewed: REVIEWED_AT_STATION_PAGE,
  },
  {
    // 🔴 The list is a SEARCH of a bounded read, not a station total: the backend has no station
    // filter on reports, so the page reads each serving line's newest reports and keeps the ones that
    // name the station. On a busy line that reaches back only a short time, and the sentence says so.
    id: "station.reports",
    sectionId: "line-status",
    title: "Rider reports that name a station",
    definition:
      "A station's page shows the line status reports that name the station, taken from the {{STATION_REPORTS_PER_LINE}} newest reports of each line that serves it, newest first. A rider chooses which stations a report names, so a report about this station that does not name it is not shown, and a report older than its line's newest {{STATION_REPORTS_PER_LINE}} is not searched: on a busy line the list reaches back only a short time. Each row is one rider's report as filed. The list counts reports, not faults, and it is not a status of the station.",
    summary:
      "Line status reports that name this station, from the {{STATION_REPORTS_PER_LINE}} newest reports of each line serving it. Older reports are not searched, and it counts reports, not faults.",
    ownerRoute: null,
    sourceSpec: "LINE_STATUS_DERIVE.md",
    lastReviewed: REVIEWED_AT_STATION_PAGE,
  },
  {
    // The alert bell on a pinned line (features/home/line-pulse/line-alert-bell.component.ts) and the
    // profile's Alerts card. 🔴 What a rider cannot see from a bell: which incidents send an alert (a
    // moderator's approval of a MAJOR one, nothing else) and why a second one on the same line can stay
    // silent (the backend's per-line cooldown). It is an incident-RECORD rule, so it sits with them.
    id: "incidents.push-alerts",
    sectionId: "episodes",
    title: "Line alerts",
    definition:
      "With alerts on for a line, this browser shows a notification when a moderator approves a Major incident from the incident calendar that is tagged with that line, or approves a change that makes such an incident Major. Minor incidents, incidents a moderator creates or edits directly, and official operator posts send no alert. A line sends at most one alert every {{PUSH_ALERT_COOLDOWN_MINUTES}} minutes, so another approval on it inside that time stays silent, and a browser that follows several lines of one incident gets one alert. Tapping the alert opens the incident calendar on the day the incident starts; while MLPTF is on screen, the alert shows inside the page instead. Alerts belong to this browser and your account: signing out turns them off here.",
    summary:
      "A Major incident on this line, once a moderator approves it. At most one alert a line every {{PUSH_ALERT_COOLDOWN_MINUTES}} minutes; it opens the calendar on the incident's day.",
    ownerRoute: "/",
    sourceSpec: "PUSH_NOTIFICATIONS.md",
    lastReviewed: REVIEWED_AT_PUSH_ALERTS,
  },
];
