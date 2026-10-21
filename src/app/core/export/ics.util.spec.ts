import { describe, expect, it } from "vitest";

import {
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  toIcsLocalDateTime,
  toIcsUtcStamp,
  type IcsEvent,
} from "./ics.util";

const NOW = new Date("2026-10-21T03:15:30.456Z");

const EVENT: IcsEvent = {
  uid: "incident-42@community.mlptf.org.my",
  start: "2026-10-21T08:30:00",
  end: "2026-10-21T10:00:00",
  summary: "Signal failure",
  description: "Trains are slow",
  url: "https://community.mlptf.org.my/insiden/2026-10-21",
};

/** RFC 5545 §3.1 unfolding: delete every CRLF that is followed by a space or tab. */
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

/** The logical content lines of a calendar, folded lines rejoined. */
function logicalLines(ics: string): string[] {
  return unfold(ics)
    .split("\r\n")
    .filter((line) => line !== "");
}

/** The logical lines of ONE event, from its BEGIN:VEVENT to its END:VEVENT. */
function eventLinesOf(ics: string, index = 0): string[] {
  const lines = logicalLines(ics);
  const starts = lines.flatMap((line, i) => (line === "BEGIN:VEVENT" ? [i] : []));
  const from = starts[index];
  if (from === undefined) {
    throw new Error(`no event #${index}`);
  }
  return lines.slice(from, lines.indexOf("END:VEVENT", from) + 1);
}

/** A high surrogate with no low surrogate after it, or a low one with no high one before it. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function octets(line: string): number {
  return new TextEncoder().encode(line).length;
}

describe("ics.util: escapeIcsText", () => {
  it("escapes backslash, semicolon and comma", () => {
    expect(escapeIcsText("a\\b;c,d")).toBe("a\\\\b\\;c\\,d");
  });

  it("escapes the backslash FIRST, so a backslash added by another rule is never doubled", () => {
    // `;` becomes `\;` and must not then become `\\;`: that would read back as a literal
    // backslash followed by a bare semicolon.
    expect(escapeIcsText("x;y")).toBe("x\\;y");
    expect(escapeIcsText("x\\;y")).toBe("x\\\\\\;y");
  });

  it("turns LF, CRLF and a lone CR into the two characters \\n", () => {
    expect(escapeIcsText("one\ntwo")).toBe("one\\ntwo");
    expect(escapeIcsText("one\r\ntwo")).toBe("one\\ntwo");
    expect(escapeIcsText("one\rtwo")).toBe("one\\ntwo");
  });

  it("never lets a value start a new content line", () => {
    const hostile = "Delay\r\nBEGIN:VEVENT\r\nSUMMARY:forged";

    expect(escapeIcsText(hostile)).not.toMatch(/[\r\n]/);
  });

  it("drops control characters the format forbids but keeps TAB and non-ASCII text", () => {
    expect(escapeIcsText("a\u0000b\u0007c\u007Fd")).toBe("abcd");
    expect(escapeIcsText("a\tb")).toBe("a\tb");
    expect(escapeIcsText("Lembah Pantai — tren lewat 🚆")).toBe("Lembah Pantai — tren lewat 🚆");
  });
});

describe("ics.util: foldIcsLine", () => {
  it("leaves a line of 75 octets or fewer alone", () => {
    const line = "X".repeat(75);

    expect(foldIcsLine(line)).toBe(line);
  });

  it("folds a 76-octet line into 75 + 1, joined by CRLF and a space", () => {
    const line = "X".repeat(76);

    expect(foldIcsLine(line)).toBe(`${"X".repeat(75)}\r\n X`);
  });

  it("keeps every physical line, leading space included, within 75 octets", () => {
    const folded = foldIcsLine(`SUMMARY:${"abcdefghij".repeat(40)}`);

    for (const physical of folded.split("\r\n")) {
      expect(octets(physical)).toBeLessThanOrEqual(75);
    }
    // Continuations hold 74 octets of content behind the leading space.
    expect(octets(folded.split("\r\n")[1] ?? "")).toBe(75);
  });

  it("unfolds back to exactly the original line", () => {
    const line = `DESCRIPTION:${"Kereta api lewat, sila gunakan laluan alternatif. ".repeat(12)}`;

    expect(unfold(foldIcsLine(line))).toBe(line);
  });

  it("measures octets, not characters, and never splits a multi-byte sequence", () => {
    // Each of these is 3 UTF-8 octets, so 40 of them (120 octets) must fold even though the line
    // is only 40 characters long — and no fold may fall inside a character.
    const line = "漢".repeat(40);
    const folded = foldIcsLine(line);

    expect(folded).toContain("\r\n ");
    for (const physical of folded.split("\r\n")) {
      expect(octets(physical)).toBeLessThanOrEqual(75);
    }
    expect(unfold(folded)).toBe(line);
  });

  it("never splits a surrogate pair (4-octet emoji)", () => {
    const line = `SUMMARY:${"🚆".repeat(30)}`;
    const folded = foldIcsLine(line);

    for (const physical of folded.split("\r\n")) {
      expect(octets(physical)).toBeLessThanOrEqual(75);
      // A split pair would leave a lone surrogate half at a physical line's edge.
      expect(physical).not.toMatch(LONE_SURROGATE);
    }
    expect(unfold(folded)).toBe(line);
  });
});

describe("ics.util: toIcsLocalDateTime", () => {
  it("drops the separators", () => {
    expect(toIcsLocalDateTime("2026-10-21T08:30:00")).toBe("20261021T083000");
  });

  it("drops fractional seconds and defaults missing seconds to 00", () => {
    expect(toIcsLocalDateTime("2026-10-21T08:30:00.123456")).toBe("20261021T083000");
    expect(toIcsLocalDateTime("2026-10-21T08:30")).toBe("20261021T083000");
  });

  it("accepts a space between date and time", () => {
    expect(toIcsLocalDateTime("2026-10-21 08:30:00")).toBe("20261021T083000");
  });

  it("rejects a value carrying Z or an offset rather than silently shifting it", () => {
    // Dropping the suffix would move the event by hours — see the function's doc.
    expect(() => toIcsLocalDateTime("2026-10-21T08:30:00Z")).toThrow(/offset-free/);
    expect(() => toIcsLocalDateTime("2026-10-21T08:30:00+08:00")).toThrow(/offset-free/);
  });

  it("rejects text that is not a datetime at all", () => {
    expect(() => toIcsLocalDateTime("tomorrow")).toThrow(/offset-free/);
    expect(() => toIcsLocalDateTime("")).toThrow(/offset-free/);
  });
});

describe("ics.util: toIcsUtcStamp", () => {
  it("formats an instant as a UTC DATE-TIME with no separators or milliseconds", () => {
    expect(toIcsUtcStamp(NOW)).toBe("20261021T031530Z");
  });
});

describe("ics.util: buildIcs", () => {
  it("wraps the events in a version 2.0 calendar with a PRODID", () => {
    const ics = buildIcs([EVENT], { now: NOW });
    const lines = logicalLines(ics);

    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines.some((line) => line.startsWith("PRODID:"))).toBe(true);
    expect(lines.at(-1)).toBe("END:VCALENDAR");
  });

  it("uses CRLF for every line break and ends with one — never a bare LF", () => {
    const ics = buildIcs([EVENT, { ...EVENT, uid: "incident-43@community.mlptf.org.my" }], {
      now: NOW,
    });

    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("defines the Kuala Lumpur zone so clients that do not know the TZID can still place events", () => {
    const lines = logicalLines(buildIcs([EVENT], { now: NOW }));

    expect(lines).toContain("BEGIN:VTIMEZONE");
    expect(lines).toContain("TZID:Asia/Kuala_Lumpur");
    expect(lines).toContain("TZOFFSETTO:+0800");
    expect(lines).toContain("END:VTIMEZONE");
  });

  it("writes one event's properties: UID, DTSTAMP, TZID times, SUMMARY, DESCRIPTION, URL", () => {
    const event = eventLinesOf(buildIcs([EVENT], { now: NOW }));

    expect(event).toEqual([
      "BEGIN:VEVENT",
      "UID:incident-42@community.mlptf.org.my",
      "DTSTAMP:20261021T031530Z",
      "DTSTART;TZID=Asia/Kuala_Lumpur:20261021T083000",
      "DTEND;TZID=Asia/Kuala_Lumpur:20261021T100000",
      "SUMMARY:Signal failure",
      "DESCRIPTION:Trains are slow",
      "URL:https://community.mlptf.org.my/insiden/2026-10-21",
      "END:VEVENT",
    ]);
  });

  it("writes NO DTEND for an open-ended (ongoing) event", () => {
    const event = eventLinesOf(buildIcs([{ ...EVENT, end: null }], { now: NOW }));

    expect(event.some((line) => line.startsWith("DTEND"))).toBe(false);
    expect(event.some((line) => line.startsWith("DTSTART"))).toBe(true);
  });

  it("writes no DTEND when the end is not after the start, which clients reject the file over", () => {
    const equal = eventLinesOf(buildIcs([{ ...EVENT, end: EVENT.start }], { now: NOW }));
    const before = eventLinesOf(buildIcs([{ ...EVENT, end: "2026-10-21T07:00:00" }], { now: NOW }));

    expect(equal.some((line) => line.startsWith("DTEND"))).toBe(false);
    expect(before.some((line) => line.startsWith("DTEND"))).toBe(false);
  });

  it("escapes SUMMARY and DESCRIPTION but writes the URL verbatim", () => {
    const event = eventLinesOf(
      buildIcs(
        [
          {
            ...EVENT,
            summary: "Kajang, Sri Petaling; delayed",
            description: "line one\nline two \\ back",
            url: "https://community.mlptf.org.my/insiden/2026-10-21?a=1,2;3",
          },
        ],
        { now: NOW },
      ),
    );

    expect(event).toContain("SUMMARY:Kajang\\, Sri Petaling\\; delayed");
    expect(event).toContain("DESCRIPTION:line one\\nline two \\\\ back");
    expect(event).toContain("URL:https://community.mlptf.org.my/insiden/2026-10-21?a=1,2;3");
  });

  it("cannot be made to forge an event through a hostile title", () => {
    const ics = buildIcs([{ ...EVENT, summary: "x\r\nBEGIN:VEVENT\r\nUID:forged\r\nEND:VEVENT" }], {
      now: NOW,
    });

    expect(logicalLines(ics).filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(logicalLines(ics).filter((line) => line.startsWith("UID:"))).toHaveLength(1);
  });

  it("folds a long SUMMARY at 75 octets and unfolds back to the escaped value", () => {
    const summary = "Gangguan perkhidmatan, ".repeat(10);
    const ics = buildIcs([{ ...EVENT, summary }], { now: NOW });

    for (const physical of ics.split("\r\n")) {
      expect(octets(physical)).toBeLessThanOrEqual(75);
    }
    expect(eventLinesOf(ics)).toContain(`SUMMARY:${escapeIcsText(summary)}`);
  });

  it("omits DESCRIPTION, URL and STATUS when they are not supplied", () => {
    const event = eventLinesOf(
      buildIcs([{ uid: "u@x", start: "2026-10-21T08:30:00", summary: "Bare" }], { now: NOW }),
    );

    expect(event).toEqual([
      "BEGIN:VEVENT",
      "UID:u@x",
      "DTSTAMP:20261021T031530Z",
      "DTSTART;TZID=Asia/Kuala_Lumpur:20261021T083000",
      "SUMMARY:Bare",
      "END:VEVENT",
    ]);
  });

  it("writes STATUS when the event has one", () => {
    expect(eventLinesOf(buildIcs([{ ...EVENT, status: "TENTATIVE" }], { now: NOW }))).toContain(
      "STATUS:TENTATIVE",
    );
  });

  it("emits events in the order given", () => {
    const ics = buildIcs(
      [
        { ...EVENT, uid: "b@x", summary: "Second" },
        { ...EVENT, uid: "a@x", summary: "First?" },
      ],
      { now: NOW },
    );

    expect(eventLinesOf(ics, 0)).toContain("UID:b@x");
    expect(eventLinesOf(ics, 1)).toContain("UID:a@x");
  });

  it("still yields a well-formed calendar for zero events", () => {
    const lines = logicalLines(buildIcs([], { now: NOW }));

    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).not.toContain("BEGIN:VEVENT");
  });

  it("stamps with the real clock when none is injected", () => {
    const before = Date.now();
    const stamp = logicalLines(buildIcs([EVENT])).find((line) => line.startsWith("DTSTAMP:"));
    const after = Date.now();

    const text = (stamp ?? "").replace("DTSTAMP:", "");
    const parsed = Date.parse(
      `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(9, 11)}:${text.slice(11, 13)}:${text.slice(13, 15)}Z`,
    );
    // DTSTAMP drops milliseconds, so allow a second of slack on the low side.
    expect(parsed).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("throws on an event whose time is not an offset-free local datetime", () => {
    expect(() => buildIcs([{ ...EVENT, start: "2026-10-21T08:30:00Z" }], { now: NOW })).toThrow(
      /offset-free/,
    );
  });

  it("refuses a UID or URL that would break its line", () => {
    expect(() => buildIcs([{ ...EVENT, uid: "a\r\nb" }], { now: NOW })).toThrow(/UID/);
    expect(() =>
      buildIcs([{ ...EVENT, url: "https://x.test/\nBEGIN:VEVENT" }], { now: NOW }),
    ).toThrow(/URL/);
  });
});
