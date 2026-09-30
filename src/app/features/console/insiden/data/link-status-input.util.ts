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
    status,
  };
}
