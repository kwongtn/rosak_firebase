import { transit_realtime } from "gtfs-realtime-bindings";

const STOP_STATUS_LABEL: Record<number, string> = {
    [transit_realtime.VehiclePosition.VehicleStopStatus.INCOMING_AT]: "Approaching stop",
    [transit_realtime.VehiclePosition.VehicleStopStatus.STOPPED_AT]: "Stopped at",
    [transit_realtime.VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO]: "En route to",
};

const OCCUPANCY_LABEL: Record<number, string> = {
    [transit_realtime.VehiclePosition.OccupancyStatus.EMPTY]: "Empty",
    [transit_realtime.VehiclePosition.OccupancyStatus.MANY_SEATS_AVAILABLE]: "Many seats available",
    [transit_realtime.VehiclePosition.OccupancyStatus.FEW_SEATS_AVAILABLE]: "Few seats available",
    [transit_realtime.VehiclePosition.OccupancyStatus.STANDING_ROOM_ONLY]: "Standing room only",
    [transit_realtime.VehiclePosition.OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY]: "Crushed standing room",
    [transit_realtime.VehiclePosition.OccupancyStatus.FULL]: "Full",
    [transit_realtime.VehiclePosition.OccupancyStatus.NOT_ACCEPTING_PASSENGERS]: "Not accepting passengers",
    [transit_realtime.VehiclePosition.OccupancyStatus.NOT_BOARDABLE]: "Not boardable",
};

const CONGESTION_LABEL: Record<number, string> = {
    [transit_realtime.VehiclePosition.CongestionLevel.RUNNING_SMOOTHLY]: "Running smoothly",
    [transit_realtime.VehiclePosition.CongestionLevel.STOP_AND_GO]: "Stop-and-go",
    [transit_realtime.VehiclePosition.CongestionLevel.CONGESTION]: "Congested",
    [transit_realtime.VehiclePosition.CongestionLevel.SEVERE_CONGESTION]: "Severe congestion",
};

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]!);
}

/** "3m ago" / "2h ago" — a GTFS-RT `timestamp` is Unix seconds (occasionally a protobuf `Long`,
 * hence the `.toString()` round-trip), and "how stale is this" matters more here than the exact
 * clock time. */
function relativeTimeFrom(timestamp: number | { toString(): string } | null | undefined): string | null {
    if (timestamp == null) {
        return null;
    }
    const seconds = typeof timestamp === "number" ? timestamp : Number(timestamp.toString());
    if (!Number.isFinite(seconds)) {
        return null;
    }
    const deltaSec = Math.max(0, Math.round(Date.now() / 1000 - seconds));
    if (deltaSec < 60) return `${deltaSec}s ago`;
    if (deltaSec < 3600) return `${Math.round(deltaSec / 60)}m ago`;
    return `${Math.round(deltaSec / 3600)}h ago`;
}

/**
 * Builds the realtime marker popup's HTML — plain Tailwind-classed markup (not an Angular
 * component: L7's `Popup` mounts its content directly into the map's own DOM, outside Angular's
 * component tree, so there's nothing to bind to; Tailwind's utility classes are plain global CSS
 * and apply here exactly as anywhere else in the app). See styles.css's `.l7-popup-content`
 * override for the surrounding chrome (background/shadow/radius) this content sits inside.
 *
 * Each row is independently optional — a feed that's missing a field (or a future field this
 * doesn't know about yet) just renders fewer rows rather than "undefined" text, and adding a new
 * one is a single `rows.push(...)` line, not a template rewrite.
 */
export function buildVehiclePopupHtml(vehicle: transit_realtime.IVehiclePosition | null | undefined): string {
    const title = vehicle?.vehicle?.label || vehicle?.vehicle?.id || "Vehicle";

    const rows: Array<{ label: string; value: string }> = [];
    if (vehicle?.vehicle?.label && vehicle.vehicle.id) {
        rows.push({ label: "Vehicle ID", value: vehicle.vehicle.id });
    }
    if (vehicle?.trip?.tripId) {
        rows.push({ label: "Trip", value: vehicle.trip.tripId });
    }
    if (vehicle?.trip?.routeId) {
        rows.push({ label: "Route", value: vehicle.trip.routeId });
    }
    const stopStatusLabel = vehicle?.currentStatus != null ? STOP_STATUS_LABEL[vehicle.currentStatus] : undefined;
    if (stopStatusLabel && vehicle?.stopId) {
        rows.push({ label: stopStatusLabel, value: vehicle.stopId });
    }
    if (vehicle?.position?.speed != null) {
        rows.push({ label: "Speed", value: `${Math.round(vehicle.position.speed * 3.6)} km/h` });
    }
    if (vehicle?.position?.bearing != null) {
        rows.push({ label: "Bearing", value: `${Math.round(vehicle.position.bearing)}°` });
    }
    const occupancyLabel = vehicle?.occupancyStatus != null ? OCCUPANCY_LABEL[vehicle.occupancyStatus] : undefined;
    if (occupancyLabel) {
        rows.push({ label: "Occupancy", value: occupancyLabel });
    }
    const congestionLabel = vehicle?.congestionLevel != null ? CONGESTION_LABEL[vehicle.congestionLevel] : undefined;
    if (congestionLabel) {
        rows.push({ label: "Traffic", value: congestionLabel });
    }
    const updated = relativeTimeFrom(vehicle?.timestamp);
    if (updated) {
        rows.push({ label: "Updated", value: updated });
    }

    const rowsHtml = rows
        .map(
            (row) => `
                <div class="flex items-baseline justify-between gap-3">
                    <dt class="text-muted-foreground">${escapeHtml(row.label)}</dt>
                    <dd class="font-medium">${escapeHtml(row.value)}</dd>
                </div>`
        )
        .join("");

    return `
        <div class="flex min-w-44 flex-col gap-1.5 text-xs">
            <p class="text-foreground text-sm font-semibold">${escapeHtml(String(title))}</p>
            <dl class="flex flex-col gap-1">
                ${rowsHtml || "<p class=\"text-muted-foreground\">No further data available.</p>"}
            </dl>
        </div>
    `;
}
