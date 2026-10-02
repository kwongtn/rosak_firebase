import type { BadgeVariants } from "../../../ui/badge/badge";
import type { LineStatus, PassengerStatus } from "./home.queries";

/**
 * How much a line's reported status can be trusted, as ONE plain-language chip.
 *
 * This exists because "what does the page know, and how do we know it?" was being answered three
 * different ways on the same screen: the operational pill (a backend state), the passenger badge
 * (a derived crowd reading), and the report count in the popover (raw volume). A reader comparing
 * "12/16 in service" with "Crowded" with "(3)" has no way to tell whether the line's status was
 * announced by the operator, corroborated by several riders, or one person's guess — and those are
 * three very different things to act on. The chip states which one it is, and its popover points at
 * the methodology entry that defines it.
 *
 * 🔴 **THE RULE, in evaluation order.** The first matching branch wins; the rest are not consulted,
 * and the order is the whole design rather than an implementation detail:
 *
 *  1. **`official`** — at least one of the line's pulse links is an operator-sourced post
 *     (`isAutomated === true`, backend `is_automated`). An official post OUTRANKS every count: the
 *     operator stated it, so "3 reports agree" is not stronger evidence than the operator saying so,
 *     and letting a rider tally quietly promote an unofficial report to "Confirmed" would be a lie
 *     about provenance. Checked FIRST, so a line that is both officially announced and heavily
 *     reported still reads as official.
 *  2. **`none`** — no status evidence of any kind: no reports in the window, no rider-reported
 *     passenger status above NORMAL, and the line itself is fully operational. This is the "we know
 *     nothing" state, and it gets its own label rather than an optimistic "Confirmed" — claiming
 *     confirmation from zero reports is the exact failure this chip exists to prevent.
 *  3. **`confirmed`** — there IS evidence and `reportCount >= CONFIRMED_MIN_REPORTS`. Several
 *     independent riders inside one rolling window is corroboration.
 *  4. **`unconfirmed`** — there IS evidence but fewer than {@link CONFIRMED_MIN_REPORTS} reports
 *     behind it. The label carries the count so the reader can see how thin it is.
 *
 * **What counts as evidence** (used by both `none` and the two report-count branches): at least one
 * report in the line's own rolling window, OR a rider-reported passenger status above `NORMAL`, OR a
 * non-`ACTIVE` operational status. The last of those is deliberately evidence with a report count of
 * zero — a line marked `PARTIAL_DISRUPTION` has been told something, and "Unconfirmed (0 reports)"
 * is the honest way to say the page has an operator-declared disruption but no rider reports behind
 * it yet. Conversely a `passengerStatus` of `NORMAL` is NOT evidence: it is the derived default the
 * backend reports when nothing notable was filed, and treating it as one would put a confident green
 * chip on a line nobody has ever reported.
 *
 * Pure and total: every field may be absent, and no input can throw. Angular-free apart from a
 * type-only badge-variant import, so the whole rule is spec-able without a DOM.
 */

/**
 * Reports in the line's own rolling window at or above which a rider-reported status counts as
 * corroborated.
 *
 * Three is the smallest number that still means "several people independently saw this" rather
 * than "someone and their group chat". It is the frontend's own rule — not a backend measurement —
 * so it lives here AND is published through the methodology registry as
 * `METHODOLOGY_CONSTANTS.CONFIRMED_MIN_REPORTS`, with `status-confidence.confirmed` as its metric
 * doc. There is one number with two readers, not two copies; `status-confidence.util.spec.ts` pins
 * them together. Raising it is a copy change: a wider window would need the backend's own window to
 * be revisited first, since the count is already scoped to `statusWindowMinutes`.
 */
export const CONFIRMED_MIN_REPORTS = 3;

/** The four confidence states, in descending trust. The chip's copy and colour key off this. */
export type StatusConfidenceLevel = "official" | "confirmed" | "unconfirmed" | "none";

/** The evidence a line carries, as the three facts the rule reads. Anything may be absent. */
export interface StatusConfidenceInput {
  /** Reports inside the line's own rolling window (`statusWindowMinutes`). */
  reportCount?: number | null;
  /** The backend's derived rider-reported status, if any. */
  passengerStatus?: PassengerStatus | null;
  /** The line's operational status. */
  status?: LineStatus | null;
  /** True when at least one of the line's `pulseLinks` is an operator-sourced post. */
  hasOfficialPost?: boolean | null;
}

/** One resolved confidence state: the level, the chip's copy, its colour, and its metric doc. */
export interface StatusConfidence {
  level: StatusConfidenceLevel;
  /** The chip's visible text. Plain language, never a bare number or an internal noun. */
  label: string;
  /** `hlmBadge` variant, so the card and the compact row cannot drift apart in colour. */
  variant: BadgeVariants["variant"];
  /** Methodology `MetricDoc` id defining this level — the popover reads its copy from there. */
  metricId: string;
  /** Reports behind the reading, for the `unconfirmed` label and for a host that wants to show it. */
  reportCount: number;
}

const OFFICIAL: Omit<StatusConfidence, "reportCount"> = {
  level: "official",
  label: "Official update",
  variant: "info",
  metricId: "status-confidence.official",
};

const CONFIRMED: Omit<StatusConfidence, "reportCount"> = {
  level: "confirmed",
  label: "Confirmed",
  variant: "success",
  metricId: "status-confidence.confirmed",
};

const UNCONFIRMED: Omit<StatusConfidence, "reportCount"> = {
  level: "unconfirmed",
  label: "Unconfirmed",
  variant: "warning",
  metricId: "status-confidence.unconfirmed",
};

const NONE: Omit<StatusConfidence, "reportCount"> = {
  level: "none",
  label: "No recent reports",
  variant: "neutral",
  metricId: "status-confidence.none",
};

/**
 * Whether there is any status evidence at all — see the rule's "What counts as evidence" note.
 *
 * `reportCount` is coerced through a non-negative-number guard rather than trusted: a missing or
 * `NaN` count must read as "no reports", never as a chip that divides or compares against `NaN`,
 * and a negative one is not something the backend can produce but must not be allowed to skip the
 * `>= 1` test either.
 */
function hasStatusEvidence(input: StatusConfidenceInput, reportCount: number): boolean {
  if (reportCount >= 1) {
    return true;
  }
  if (input.status && input.status !== "ACTIVE") {
    return true;
  }
  // NORMAL is the derived "nothing notable" reading, not a report.
  return Boolean(input.passengerStatus) && input.passengerStatus !== "NORMAL";
}

/**
 * Resolve one line's confidence from its three facts. Total — absent fields are valid input, and a
 * line with nothing at all resolves to `none` rather than throwing.
 */
export function statusConfidence(
  input: StatusConfidenceInput | null | undefined,
): StatusConfidence {
  const evidence: StatusConfidenceInput = input ?? {};
  const raw = evidence.reportCount;
  const reportCount =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

  if (evidence.hasOfficialPost === true) {
    return { ...OFFICIAL, reportCount };
  }
  if (!hasStatusEvidence(evidence, reportCount)) {
    return { ...NONE, reportCount };
  }
  if (reportCount >= CONFIRMED_MIN_REPORTS) {
    return { ...CONFIRMED, reportCount };
  }
  // The count is in the LABEL here and nowhere else, so the reader sees how thin the evidence is
  // without opening the popover. `0` is reachable (an operator-declared disruption nobody has filed
  // a rider report about) and is printed rather than hidden — "(0 reports)" is a true statement,
  // whereas dropping the count would imply there were some.
  return { ...UNCONFIRMED, label: `Unconfirmed (${reportCount} reports)`, reportCount };
}

/**
 * Whether any of the line's pulse links is an operator-sourced post.
 *
 * Takes the array rather than a `LinePulse` so this module stays free of the query types at
 * runtime, and tolerates a missing/short list (`?? []`) because `strictNullChecks` is OFF and a
 * hand-built fixture must not throw inside a computed. `=== true` rather than truthiness: the field
 * is a non-null boolean server-side, and a `0`/`""`/absent value must read as "no official post"
 * rather than claiming provenance that was never sent.
 */
export function hasOfficialPulseLink(
  pulseLinks: readonly { isAutomated?: boolean | null }[] | null | undefined,
): boolean {
  return (pulseLinks ?? []).some((link) => link?.isAutomated === true);
}
