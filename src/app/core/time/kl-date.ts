/** Malaysia has no DST, so Asia/Kuala_Lumpur is a fixed UTC+8. */
const KL_OFFSET_MS = 8 * 3_600_000;

/**
 * `YYYY-MM-DD` of an instant on the Asia/Kuala_Lumpur wall clock — the frame every backend
 * datetime is in (`USE_TZ = False`, `TIME_ZONE = Asia/Kuala_Lumpur`). Shifts by the fixed +8 h and
 * reads the UTC fields, so the answer is identical whatever zone the process runs in (the UTC SSR
 * server, a Malaysian browser, a roaming rider's browser): "today" never differs between server and
 * client, and never lags a day behind between 00:00 and 08:00 MYT the way a UTC date does.
 */
export function klDateKey(now: number = Date.now()): string {
  return new Date(now + KL_OFFSET_MS).toISOString().slice(0, 10);
}
