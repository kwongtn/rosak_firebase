import { environment } from "../../../environments/environment";

/**
 * Central configuration for manually-placed AdSense units.
 *
 * The AdSense loader script is loaded once in `index.html` (do NOT add it again anywhere); this
 * config only maps the logical slot keys used across the app to their real `data-ad-slot` unit
 * ids. The publisher client is reused from the old app (same site/account) rather than a fresh
 * id — see the comment in `index.html` for why no new account was provisioned.
 *
 * Per plan §5, every logical slot currently reuses the single AdSense unit `"3724291191"`
 * ("mlptf"). Each key exists so call sites reference a stable, self-documenting name and so a
 * future per-slot unit is a one-line change here, not a sweep across the codebase.
 */
export const ADS_CONFIG = {
  /** Publisher client id for `data-ad-client`. */
  client: "ca-pub-3632544969292535",
  /** Ads are only served in the production build. Local dev uses `environment.development.ts`
   * (via file replacement), so `enabled` is `false` there and the component falls back to its
   * placeholder mode (`?adpreview=1`) for QA. */
  enabled: environment.production,
  slots: {
    footerEnd: "3724291191",
    galleryBetweenYears: "3724291191",
    insidenFeed: "3724291191",
    lineOverviewBetweenTypes: "3724291191",
    vehicleDetailBetweenCards: "3724291191",
    profileBetweenCards: "3724291191",
    insidenDetailsInline: "3724291191",
    gallerySidebar: "3724291191",
    aboutBetweenSections: "3724291191",
  },
} as const;

/** Union of logical slot keys configured above — the parameter type for `resolveAdSlot`. */
export type AdSlotKey = keyof typeof ADS_CONFIG.slots;

/**
 * Resolves a logical slot key to its real AdSense unit id.
 *
 * Returns `undefined` when ads are disabled (`ADS_CONFIG.enabled === false`) or when `key` is not
 * a configured slot. Callers must treat `undefined` as "render nothing" — `AdSlotComponent`
 * renders zero DOM for an unconfigured slot.
 */
export function resolveAdSlot(key: AdSlotKey): string | undefined {
  if (!ADS_CONFIG.enabled) {
    return undefined;
  }
  return ADS_CONFIG.slots[key];
}
