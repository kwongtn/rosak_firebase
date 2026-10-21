/**
 * iCalendar (RFC 5545) serialisation for the "Add to calendar" and "Export month" affordances.
 *
 * Split the same way `csv.util.ts` is: {@link buildIcs} is a PURE function (no DOM, no platform
 * flag, the clock injected) so it is unit-testable byte for byte and safe to run on the server; the
 * browser half is `downloadIcs` in `csv.util.ts`, beside `downloadCsv`, which shares its Blob +
 * anchor mechanism.
 *
 * Four rules a hand-rolled `.ics` gets wrong, and that this file owns so no caller can:
 *
 *  1. **Line endings are CRLF, and a bare `\n` never appears.** RFC 5545 mandates CRLF; several
 *     calendar clients silently drop an event whose lines end in `\n`.
 *  2. **TEXT values are escaped** ({@link escapeIcsText}): backslash, semicolon, comma and every
 *     line break. A title is community-written, so an unescaped newline would let it start a NEW
 *     content line (`\r\nBEGIN:VEVENT…`) and forge calendar structure. Escaping is also what keeps
 *     "Kajang, Sri Petaling; delayed" one SUMMARY rather than a broken property list.
 *  3. **Lines are folded at 75 OCTETS, not characters** ({@link foldIcsLine}). A Malay or emoji
 *     title is several octets per character, and a fold may never land inside a UTF-8 sequence.
 *  4. **Times are offset-free Kuala Lumpur wall times with an explicit `TZID`.** The API sends
 *     incident times as naive local datetimes (backend `USE_TZ = False`); writing them as UTC
 *     (`…Z`) would move every event eight hours, and a floating time would land at the importing
 *     person's own zone. The one zone Malaysia uses has no daylight saving, so a single
 *     `VTIMEZONE` rule is the whole definition.
 */

/** The IANA zone every incident time is written in. */
export const ICS_TIME_ZONE = "Asia/Kuala_Lumpur";

/** RFC 5545 `STATUS` values for an event. */
export type IcsEventStatus = "CONFIRMED" | "TENTATIVE" | "CANCELLED";

/** One calendar event. Times are offset-free local datetimes, exactly as the API sends them. */
export interface IcsEvent {
  /**
   * Globally unique and STABLE across exports: importing the same incident twice must update the
   * event rather than duplicate it, so a caller derives this from the record's identity, never from
   * the export time.
   */
  uid: string;
  /** Offset-free local start, `YYYY-MM-DDTHH:mm[:ss[.fraction]]`. */
  start: string;
  /** Offset-free local end. Omit (or `null`) for an open-ended event: no `DTEND` is written. */
  end?: string | null;
  summary: string;
  description?: string;
  /** Written verbatim as a URI (`URL` is not a TEXT property, so it is not escaped). */
  url?: string;
  status?: IcsEventStatus;
}

export interface BuildIcsOptions {
  /** The `DTSTAMP` instant. Injected so a spec can pin the bytes; defaults to now. */
  now?: Date;
}

const CRLF = "\r\n";

/** Product identifier (RFC 5545 §3.7.3): who generated the file. */
const PRODID = "-//MLPTF Community//Insiden//EN";

/** RFC 5545 §3.1: a content line is at most 75 octets before it must be folded. */
const MAX_LINE_OCTETS = 75;

/**
 * Malaysia has used UTC+8 without daylight saving since 1982, which covers every incident this
 * platform records, so one fixed-offset STANDARD rule is the entire zone. (Clients that know
 * `Asia/Kuala_Lumpur` ignore it; the ones that do not — Outlook — need it to place the event.)
 */
const VTIMEZONE_LINES: readonly string[] = [
  "BEGIN:VTIMEZONE",
  `TZID:${ICS_TIME_ZONE}`,
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0800",
  "TZOFFSETTO:+0800",
  "TZNAME:MYT",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** C0 controls except TAB, LF and CR (those are handled as whitespace/line breaks), plus DEL.
 * RFC 5545 §3.3.11 allows none of them in a TEXT value. */
const DISALLOWED_TEXT_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** `YYYY-MM-DDTHH:mm[:ss[.fraction]]`, nothing after it: an offset or `Z` is rejected, see below. */
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

const textEncoder = new TextEncoder();

/**
 * One TEXT value as RFC 5545 §3.3.11 requires: `\` → `\\`, `;` → `\;`, `,` → `\,` and every line
 * break (CRLF, LF or a lone CR) → the two characters `\n`.
 *
 * The backslash goes FIRST: escaping it after the others would double the backslashes the other
 * rules just added. Control characters the format forbids are dropped rather than escaped, because
 * there is no escape for them.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(DISALLOWED_TEXT_CONTROLS, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds one content line to RFC 5545 §3.1's 75-octet limit: a CRLF followed by a single space
 * starts each continuation, which counts toward ITS 75 octets, so continuations carry 74 octets of
 * content.
 *
 * Measured in UTF-8 octets and walked by code point (`for…of`), so a fold never lands inside a
 * multi-byte sequence or splits a surrogate pair. Unfolding (deleting every `CRLF␠`) restores the
 * original line exactly.
 */
export function foldIcsLine(line: string): string {
  if (textEncoder.encode(line).length <= MAX_LINE_OCTETS) {
    return line;
  }
  const physical: string[] = [];
  let current = "";
  let octets = 0;
  let limit = MAX_LINE_OCTETS;
  for (const char of line) {
    const size = textEncoder.encode(char).length;
    if (octets + size > limit) {
      physical.push(current);
      current = "";
      octets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += char;
    octets += size;
  }
  physical.push(current);
  return physical.join(`${CRLF} `);
}

/**
 * An offset-free local datetime as an iCalendar DATE-TIME (`20261021T083000`): separators and any
 * fractional seconds dropped, seconds defaulted to `00`.
 *
 * Throws on anything else — in particular a value carrying `Z` or an offset. Those are not wall
 * times, and quietly dropping the suffix would move the event by hours: a loud failure reaches the
 * Sentry-backed ErrorHandler, a wrong calendar entry reaches nobody until they miss a train.
 */
export function toIcsLocalDateTime(value: string): string {
  const match = LOCAL_DATETIME.exec(value);
  if (match === null) {
    throw new Error(`Expected an offset-free local datetime (YYYY-MM-DDTHH:mm:ss), got "${value}"`);
  }
  const [, year, month, day, hour, minute, second = "00"] = match;
  return `${year}${month}${day}T${hour}${minute}${second}`;
}

/** An instant as an iCalendar UTC DATE-TIME (`20261021T083000Z`), the form `DTSTAMP` requires. */
export function toIcsUtcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** A property value that is written verbatim must stay on its own line. */
function assertSingleLine(name: string, value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${name} must not contain a line break`);
  }
  return value;
}

function eventLines(event: IcsEvent, stamp: string): string[] {
  const start = toIcsLocalDateTime(event.start);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${assertSingleLine("UID", event.uid)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${ICS_TIME_ZONE}:${start}`,
  ];
  if (event.end) {
    const end = toIcsLocalDateTime(event.end);
    // Both are the same fixed-width digits, so string order is time order. An end that is not after
    // the start is dropped (RFC 5545 §3.8.2.2 forbids DTEND before DTSTART, and an equal one adds
    // nothing): importing clients reject the whole file over one such event.
    if (end > start) {
      lines.push(`DTEND;TZID=${ICS_TIME_ZONE}:${end}`);
    }
  }
  lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }
  if (event.url) {
    lines.push(`URL:${assertSingleLine("URL", event.url)}`);
  }
  if (event.status) {
    lines.push(`STATUS:${event.status}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

/**
 * `events` as one RFC 5545 calendar, CRLF-terminated, in the order given.
 *
 * Zero events still yields a well-formed calendar (the `VTIMEZONE` is its only component), so an
 * empty export is a file a client can open rather than a malformed one.
 */
export function buildIcs(events: readonly IcsEvent[], options: BuildIcsOptions = {}): string {
  const stamp = toIcsUtcStamp(options.now ?? new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${PRODID}`, "CALSCALE:GREGORIAN"];
  lines.push(...VTIMEZONE_LINES);
  for (const event of events) {
    lines.push(...eventLines(event, stamp));
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
