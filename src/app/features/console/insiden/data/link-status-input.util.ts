import type { SocialMediaLinkStatus } from "../../../home/data/home.queries";
import type { SocialMediaLinkRow, UpdateSocialMediaLinkVars } from "./insiden-console.queries";

/**
 * The `SocialMediaLinkInput` for a status-only change (the console queue's Approve → `LIVE`
 * and Hide → `HIDDEN` verbs).
 *
 * `SocialMediaLinkInput` is NOT a patch: `url` is non-nullable and the backend service assigns
 * `title` and calls `.set()` on the four M2M tag relations unconditionally. A status-only payload
 * would therefore blank the title and strip every tag, so the row's current scalars and ids are
 * re-sent next to the new status. Extracted from `approveLink` so the two status verbs can never
 * drift apart into one of them losing a field.
 *
 * ⚠️ `occurredAt` is re-sent here for the same reason, and it is the sharpest trap of the three:
 * it is tri-state with a *destructive* third state. On `updateSocialMediaLink`
 * (rosak_backend incident/schema/mutations/interactions.py →
 * incident/services/social_links.py `update_social_media_link`):
 *
 *   key omitted        → UNSET → the event time is left alone
 *   a datetime string  → the event time is set to it
 *   an explicit `null` → RESET to `link.created` ("it happened when it was reported")
 *
 * So the value is passed through verbatim and deliberately NOT written as
 * `occurredAt: link.occurredAt ?? null`: one `??` and every Approve/Hide click in the console
 * silently rewrites the link's event time back to its submission time — which also re-sorts the
 * public feed, because the queue, the feed ordering and every window key on `occurredAt`. When
 * the row genuinely has no event time, omit the key; never send `null` to mean "unknown".
 *
 * `markCompleted` needs no equivalent: it is its own id-only mutation and never builds this
 * input. The console's saveLinkEdit panel DOES build a full `SocialMediaLinkInput` and must
 * round-trip this field once it grows a datetime control.
 */
export function linkStatusInput(
  link: SocialMediaLinkRow,
  status: SocialMediaLinkStatus,
): UpdateSocialMediaLinkVars["input"] {
  return {
    url: link.url,
    title: link.title || null,
    lineIds: link.lines.map((line) => line.id),
    vehicleIds: link.vehicles.map((vehicle) => vehicle.id),
    stationIds: link.stations.map((station) => station.id),
    categoryIds: link.categories.map((category) => category.id),
    occurredAt: link.occurredAt,
    status,
  };
}
