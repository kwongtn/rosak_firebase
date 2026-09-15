export type VehicleIconMode = "train" | "bus";

/** Hardcoded per the request: only KTMB is a train, every other realtime feed available today is
 * a bus. Not derived from any real vehicle-type data (the feeds themselves don't carry a mode
 * field) — a real mapping would need to come from GTFS-static's route_type, which isn't wired up
 * here yet. */
export function iconModeForSourceKey(key: string): VehicleIconMode {
  return key === "ktmb" ? "train" : "bus";
}

const TRAIN_PATH = `
    <rect x="4" y="3" width="16" height="14" rx="2" />
    <path d="M4 11h16" />
    <path d="M8 17v3" />
    <path d="M16 17v3" />
    <path d="M7 21h1" />
    <path d="M16 21h1" />
    <circle cx="8.5" cy="14" r=".5" fill="currentColor" />
    <circle cx="15.5" cy="14" r=".5" fill="currentColor" />
`;

const BUS_PATH = `
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M3 11h18" />
    <circle cx="7.5" cy="17.5" r="1.5" />
    <circle cx="16.5" cy="17.5" r="1.5" />
`;

/**
 * Builds one realtime vehicle marker's DOM element — a small colored circle with a train/bus
 * glyph, replacing L7's own default teardrop-pin Marker look (plain, and identical for every
 * vehicle regardless of mode). `Marker` accepts an arbitrary `element` in its constructor
 * options (see rt-marker-layer.controller.ts), so this is plain DOM API, not an Angular
 * template — there's no component tree here to bind into.
 */
export function createVehicleMarkerElement(mode: VehicleIconMode): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;" +
    "background:#2563eb;box-shadow:0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,0.4);cursor:pointer;";
  wrapper.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            ${mode === "train" ? TRAIN_PATH : BUS_PATH}
        </svg>
    `;
  return wrapper;
}
