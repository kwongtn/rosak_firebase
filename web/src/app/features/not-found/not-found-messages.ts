import { LineStatus } from "../../core/graphql/types";

export interface NotFoundMessage {
    /** The small uppercase label above the "404" — varies alongside the joke below it rather
     * than staying a single generic "Service Alert" forever. */
    eyebrow: string;
    /** A real `LineStatus` value (see core/graphql/types.ts) — rendered through the app's own
     * `LineStatusBadge`, not a lookalike, so the badge under each joke is exactly what this app
     * shows for an actual defunct/disrupted line elsewhere. */
    status: LineStatus;
    heading: string;
    body: string;
}

/**
 * The pool `NotFoundPage` picks from — see its own doc comment for why the pick is a hash of the
 * attempted URL rather than `Math.random()`: this keeps the same broken link showing the same
 * joke on both the server-rendered pass and the client's hydration pass (no flash-of-different-
 * content), while still varying across different mistyped/dead URLs. 40 entries: enough that a
 * given person is unlikely to see the same one twice in a row across a few different typos,
 * without this file becoming its own maintenance burden.
 */
export const NOT_FOUND_MESSAGES: NotFoundMessage[] = [
    {
        eyebrow: "Service Alert",
        status: "DEFUNCT",
        heading: "This route has been discontinued.",
        body: "You've arrived at a stop that isn't on any line we track — no timetable, no live position, not even a \"last spotted\" date. It may have moved, been decommissioned, or never existed in the first place. Either way, no vehicles are coming.",
    },
    {
        eyebrow: "Platform Announcement",
        status: "TOTAL_DISRUPTION",
        heading: "The next arrival at this page is never.",
        body: "We've checked the feed, the timetable, and asked around the platform. Nobody has seen a departure from here in recorded history.",
    },
    {
        eyebrow: "Control Centre Update",
        status: "DEFUNCT",
        heading: "Signal lost. Page not found.",
        body: "Somewhere between your click and our server, this page quietly left the network without telling anyone. Typical.",
    },
    {
        eyebrow: "Fleet Notice",
        status: "DEFUNCT",
        heading: "This page has been withdrawn from service.",
        body: "Pulled from the fleet, stripped for parts, and last seen heading to the scrapyard. We salute its brief, unremarkable career.",
    },
    {
        eyebrow: "GTFS Feed Error",
        status: "TOTAL_DISRUPTION",
        heading: "vehicle_positions.json returned nothing.",
        body: "Zero entities, zero trips, zero explanations. The feed is technically working — it just has nothing to say about this URL.",
    },
    {
        eyebrow: "Spotter Report",
        status: "DEFUNCT",
        heading: "Last spotted: never.",
        body: "Our most dedicated spotters — the ones who log a sighting at 2am for a single bus — have collectively never once seen this page in the wild.",
    },
    {
        eyebrow: "Operations Notice",
        status: "TESTING",
        heading: "This feature is still in testing.",
        body: "Specifically, we're testing whether anyone notices it doesn't exist yet. Congratulations, you noticed.",
    },
    {
        eyebrow: "Service Alert",
        status: "TOTAL_DISRUPTION",
        heading: "This stop was permanently closed.",
        body: "Officially for renovations. Unofficially, the renovations never started, and at this point we're not sure they were ever real.",
    },
    {
        eyebrow: "Platform Announcement",
        status: "DEFUNCT",
        heading: "Please mind the gap. It's the entire page.",
        body: "There is no platform here, no train, and no announcer. You're just reading text a developer wrote for this exact situation.",
    },
    {
        eyebrow: "Route Diversion",
        status: "DEFUNCT",
        heading: "This URL took an unscheduled diversion.",
        body: "Somewhere it missed its stop, took a wrong turn, and ended up nowhere in particular. No replacement bus has been arranged.",
    },
    {
        eyebrow: "Fleet Notice",
        status: "TOTAL_DISRUPTION",
        heading: "Vehicle status: scrapped.",
        body: "This page's chassis number no longer appears in any registry. If you owned shares in it, they are now worthless.",
    },
    {
        eyebrow: "Control Centre Update",
        status: "TOTAL_DISRUPTION",
        heading: "Real-time position: undefined.",
        body: "Not \"unavailable,\" not \"delayed\" — undefined, in the literal programming sense. Someone forgot to build this page at all.",
    },
    {
        eyebrow: "Depot Notice",
        status: "DEFUNCT",
        heading: "Reassigned to the great depot in the sky.",
        body: "This page has completed its final trip and been towed somewhere none of our maps cover.",
    },
    {
        eyebrow: "Service Alert",
        status: "DEFUNCT",
        heading: "No trip data available for this URL.",
        body: "We queried every table we have. This route simply never ran, on any day, in any timezone.",
    },
    {
        eyebrow: "Occupancy Status",
        status: "TOTAL_DISRUPTION",
        heading: "Not accepting passengers.",
        body: "Not because it's full — because it doesn't exist, which is a far more absolute way to be unavailable.",
    },
    {
        eyebrow: "Platform Announcement",
        status: "DEFUNCT",
        heading: "This is the end of the line.",
        body: "All passengers — that's you — are kindly asked to alight here. There is nowhere further this page can take you.",
    },
    {
        eyebrow: "Route Notice",
        status: "TOTAL_DISRUPTION",
        heading: "Cancelled due to lack of demand.",
        body: "Specifically, a lack of this page ever having been built in the first place, which we'll admit dampened demand considerably.",
    },
    {
        eyebrow: "Congestion Report",
        status: "PARTIAL_DISRUPTION",
        heading: "Congestion level: severe.",
        body: "Current headcount at this page: zero. Somehow, it's still the most congested thing on the internet with no data whatsoever.",
    },
    {
        eyebrow: "Spotter Report",
        status: "DEFUNCT",
        heading: "GPS coordinates point to nowhere in particular.",
        body: "We plotted this page's last known position. It landed somewhere in the ocean, which feels thematically appropriate.",
    },
    {
        eyebrow: "Service Alert",
        status: "TOTAL_DISRUPTION",
        heading: "This line was never opened to the public.",
        body: "Construction wrapped up, the ribbon was cut, and then absolutely nothing else happened. It has sat empty ever since.",
    },
    {
        eyebrow: "Maintenance Notice",
        status: "TOTAL_DISRUPTION",
        heading: "Track maintenance ahead. Permanently.",
        body: "The maintenance crew clocked in once, took one look at this URL, and clocked straight back out.",
    },
    {
        eyebrow: "Fleet Notice",
        status: "DEFUNCT",
        heading: "This vehicle failed its last inspection.",
        body: "It was quietly pulled from the roster and nobody has filed the paperwork to bring it back — including, notably, us.",
    },
    {
        eyebrow: "Control Centre Update",
        status: "DEFUNCT",
        heading: "Our database has no record of this ever running.",
        body: "We checked the archives, the backups, and the one spreadsheet nobody admits to still using. Nothing.",
    },
    {
        eyebrow: "Route Notice",
        status: "DEFUNCT",
        heading: "Merged into a line that also doesn't exist.",
        body: "Two nonexistent routes were consolidated into one, in the hope that combining them might average out to something real. It did not.",
    },
    {
        eyebrow: "Platform Announcement",
        status: "TOTAL_DISRUPTION",
        heading: "The next train has been cancelled. So has this page.",
        body: "We'd offer a replacement bus service, but there's genuinely nowhere for it to go.",
    },
    {
        eyebrow: "Bearing Report",
        status: "TOTAL_DISRUPTION",
        heading: "Bearing: undefined. Speed: 0 km/h. Existence: also 0.",
        body: "Every field we'd normally show for a live vehicle came back empty, which tracks, since there isn't one.",
    },
    {
        eyebrow: "Operations Notice",
        status: "TESTING",
        heading: "This page is running an experimental feature.",
        body: "The feature in question is \"not existing.\" Early results suggest it's working exactly as intended.",
    },
    {
        eyebrow: "Service Alert",
        status: "DEFUNCT",
        heading: "This stop is not receiving service today.",
        body: "Or yesterday. Or any day on record. At this point \"today\" is doing a lot of quiet, generous rounding.",
    },
    {
        eyebrow: "Fleet Notice",
        status: "DEFUNCT",
        heading: "Decommissioned before its first journey.",
        body: "A rare case of a page going straight from \"planned\" to \"retired\" with no service in between. Efficient, in a bleak sort of way.",
    },
    {
        eyebrow: "Route Diversion",
        status: "TOTAL_DISRUPTION",
        heading: "Diverted, indefinitely, to nowhere.",
        body: "The diversion notice went up so long ago it's started to look load-bearing. We're leaving it exactly where it is.",
    },
    {
        eyebrow: "Spotter Report",
        status: "DEFUNCT",
        heading: "Zero sightings. Zero photos. Zero notes.",
        body: "Even the entry for \"vehicle status unknown\" has more information logged against it than this page does.",
    },
    {
        eyebrow: "Control Centre Update",
        status: "TOTAL_DISRUPTION",
        heading: "This isn't a delay. It's a permanent state of affairs.",
        body: "We know a delay when we see one. This has the settled, dusty energy of something that was never coming at all.",
    },
    {
        eyebrow: "Platform Announcement",
        status: "DEFUNCT",
        heading: "Attention: this platform has been demolished.",
        body: "The rest of the station is fine. It's specifically this one page that no longer physically exists.",
    },
    {
        eyebrow: "Fleet Notice",
        status: "DEFUNCT",
        heading: "Retired from active service in a ceremony nobody attended.",
        body: "There was a small plaque planned. It, too, does not exist.",
    },
    {
        eyebrow: "Occupancy Status",
        status: "TOTAL_DISRUPTION",
        heading: "Occupancy: not applicable, on account of no vehicle.",
        body: "You can't have standing room only on something that was never built. We checked. Twice.",
    },
    {
        eyebrow: "Service Alert",
        status: "DEFUNCT",
        heading: "This route's operator ceased trading.",
        body: "In a universe where this page existed, presumably. In ours, it just never got around to starting.",
    },
    {
        eyebrow: "Route Notice",
        status: "PARTIAL_DISRUPTION",
        heading: "Partial service, in the sense that none of it works.",
        body: "\"Partial\" felt generous. We're keeping the label anyway, out of respect for whatever this page was trying to be.",
    },
    {
        eyebrow: "Depot Notice",
        status: "DEFUNCT",
        heading: "Currently housed at a depot that isn't on any map.",
        body: "Visiting hours are never, and the address doesn't resolve. We'd give directions, but there's nowhere to point.",
    },
    {
        eyebrow: "Control Centre Update",
        status: "DEFUNCT",
        heading: "404. Not delayed. Not disrupted. Just gone.",
        body: "Some pages get held up in traffic. This one got held up in never being made.",
    },
    {
        eyebrow: "Platform Announcement",
        status: "TOTAL_DISRUPTION",
        heading: "Please seek an alternative route.",
        body: "Any route, really. Statistically, almost every other page on this site is more likely to exist than this one.",
    },
];
