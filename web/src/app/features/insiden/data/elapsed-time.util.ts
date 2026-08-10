/** Ported from src/app/insiden/event-list/event-list.component.util.ts. Renders the largest two
 * non-zero units ("2 days, 3 hours" rather than a full "2 days, 3 hours, 12 minutes, 4 seconds"
 * readout) — plenty precise for an incident's duration/elapsed time, and it's what keeps the
 * live-ticking display from being noisy once an incident has run for more than a few minutes. */
export function getReadableTimeDifference(date1: Date, date2: Date): string {
    const timeDiff = Math.abs(date1.getTime() - date2.getTime());

    const seconds = Math.floor((timeDiff / 1000) % 60);
    const minutes = Math.floor((timeDiff / (1000 * 60)) % 60);
    const hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24);
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

    const units: [number, string][] = [
        [days, "day"],
        [hours, "hour"],
        [minutes, "minute"],
        [seconds, "second"],
    ];

    const parts = units
        .filter(([value]) => value > 0)
        .slice(0, 2)
        .map(([value, label]) => `${value} ${label}${value > 1 ? "s" : ""}`);

    return parts.length > 0 ? parts.join(", ") : "0 seconds";
}
