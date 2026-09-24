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
    lastReviewed: REVIEWED_AT_SHIP,
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
 * registries' copy folded in verbatim — `LINE_STATUS_INFO` / `PASSENGER_INFO`
 * (`features/home/data/status-info.util.ts`) and `PASSENGER_METRIC`
 * (`features/home/data/line-status-metrics.util.ts`). They are copied, not imported, because
 * `core/` must not depend on a feature. Vehicle-status labels and other unlanded specs carry no
 * definition yet, so they are deliberately absent (never invent a formula).
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
];
