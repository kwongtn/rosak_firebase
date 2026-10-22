import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONSTANTS } from "../../../core/methodology/methodology.constants";
import type { HomeIncidentItem } from "./home-incidents.queries";
import {
  MAX_LINE_CHIPS,
  groupIncidentsByLine,
  incidentDayKey,
  incidentDayLabel,
  incidentSeverityLabel,
  incidentSeverityVariant,
  pickLineChips,
} from "./incident-notices.util";

function makeIncident(
  id: string,
  lineIds: string[],
  overrides: Partial<HomeIncidentItem> = {},
): HomeIncidentItem {
  return {
    id,
    startDatetime: "2026-10-22T08:00:00",
    endDatetime: null,
    severity: "MINOR",
    title: `Incident ${id}`,
    brief: "",
    lines: lineIds.map((lineId) => ({ id: lineId, code: `L${lineId}` })),
    ...overrides,
  };
}

/** Runs `body` with the runner's zone forced to `tz`, then restores it (same approach as
 *  `link-occurred-at.util.spec.ts`; `noPropertyAccessFromIndexSignature` forces the bracket form). */
function withTimeZone(tz: string, body: () => void): void {
  const previous = process.env["TZ"];
  process.env["TZ"] = tz;
  try {
    body();
  } finally {
    if (previous === undefined) {
      delete process.env["TZ"];
    } else {
      process.env["TZ"] = previous;
    }
  }
}

describe("groupIncidentsByLine", () => {
  it("returns an empty map for no incidents", () => {
    expect(groupIncidentsByLine([]).size).toBe(0);
  });

  it("groups incidents under every line they are tagged with", () => {
    const shared = makeIncident("a", ["1", "2"]);
    const lineTwoOnly = makeIncident("b", ["2"]);
    const grouped = groupIncidentsByLine([shared, lineTwoOnly]);

    expect([...grouped.keys()].sort()).toEqual(["1", "2"]);
    expect(grouped.get("1")).toEqual([shared]);
    expect(grouped.get("2")).toEqual([shared, lineTwoOnly]);
  });

  it("puts the SAME incident object on each of its lines, not a copy", () => {
    const shared = makeIncident("a", ["1", "2"]);
    const grouped = groupIncidentsByLine([shared]);

    expect(grouped.get("1")?.[0]).toBe(shared);
    expect(grouped.get("2")?.[0]).toBe(shared);
  });

  it("keeps the caller's order inside a line, so the read's ORDER BY decides what comes first", () => {
    // The ongoing read is `startDatetime DESC` (newest first) and the planned-works read `ASC`
    // (soonest first). One fixed sort here would be wrong for one of them.
    const newest = makeIncident("new", ["1"], { startDatetime: "2026-10-22T09:00:00" });
    const oldest = makeIncident("old", ["1"], { startDatetime: "2026-10-20T09:00:00" });

    expect(
      groupIncidentsByLine([newest, oldest])
        .get("1")
        ?.map((i) => i.id),
    ).toEqual(["new", "old"]);
    expect(
      groupIncidentsByLine([oldest, newest])
        .get("1")
        ?.map((i) => i.id),
    ).toEqual(["old", "new"]);
  });

  it("leaves an incident with no lines on no list", () => {
    const grouped = groupIncidentsByLine([makeIncident("network-wide", [])]);

    expect(grouped.size).toBe(0);
  });

  it("lists an incident once on a line even if the line is tagged twice", () => {
    const doubled = makeIncident("a", ["1", "1"]);

    expect(groupIncidentsByLine([doubled]).get("1")).toEqual([doubled]);
  });
});

describe("pickLineChips", () => {
  const notice = (id: string) => makeIncident(id, ["1"]);

  it("draws nothing and links nothing for a line with no incidents", () => {
    expect(pickLineChips([], [])).toEqual({ chips: [], more: 0 });
  });

  it("shows a lone notice and a lone planned work with no overflow", () => {
    expect(pickLineChips([notice("n")], [])).toEqual({
      chips: [{ kind: "notice", incident: notice("n") }],
      more: 0,
    });
    expect(pickLineChips([], [notice("p")])).toEqual({
      chips: [{ kind: "planned", incident: notice("p") }],
      more: 0,
    });
  });

  it("puts notices before planned works", () => {
    const { chips } = pickLineChips([notice("n")], [notice("p")]);

    expect(chips.map((chip) => `${chip.kind}:${chip.incident.id}`)).toEqual([
      "notice:n",
      "planned:p",
    ]);
  });

  it("shows at most the cap, notices first, and counts every chip it left out", () => {
    const { chips, more } = pickLineChips(
      [notice("n1"), notice("n2"), notice("n3")],
      [notice("p1"), notice("p2")],
    );

    expect(chips.map((chip) => chip.incident.id)).toEqual(["n1", "n2"]);
    // 5 incidents, 2 drawn: the link says "+3", not "+1" for the third notice alone.
    expect(more).toBe(3);
  });

  it("lets a planned work take the second slot when there is only one notice", () => {
    const { chips, more } = pickLineChips([notice("n1")], [notice("p1"), notice("p2")]);

    expect(chips.map((chip) => chip.incident.id)).toEqual(["n1", "p1"]);
    expect(more).toBe(1);
  });

  it("draws an incident that is in both lists once, as the notice it now is", () => {
    // The two reads answer at different moments, so an incident that has just started can still be in
    // the planned list from the earlier answer.
    const { chips, more } = pickLineChips([notice("x")], [notice("x"), notice("p")]);

    expect(chips.map((chip) => `${chip.kind}:${chip.incident.id}`)).toEqual([
      "notice:x",
      "planned:p",
    ]);
    expect(more).toBe(0);
  });

  it("takes the cap as an argument", () => {
    expect(pickLineChips([notice("a"), notice("b")], [], 1)).toMatchObject({
      chips: [{ incident: { id: "a" } }],
      more: 1,
    });
  });

  it("uses the cap the methodology page publishes", () => {
    // The popover says "at most N chips"; the number is a registry token, and this is the pin.
    expect(MAX_LINE_CHIPS).toBe(METHODOLOGY_CONSTANTS["LINE_NOTICE_MAX_CHIPS"].value);
    expect(MAX_LINE_CHIPS).toBe(2);
  });
});

describe("incidentDayKey", () => {
  it("is the date part of the offset-free datetime", () => {
    expect(incidentDayKey("2026-10-25T08:30:00")).toBe("2026-10-25");
    expect(incidentDayKey("2026-10-25T08:30:00.123456")).toBe("2026-10-25");
    expect(incidentDayKey("2026-10-25 08:30:00")).toBe("2026-10-25");
    expect(incidentDayKey("2026-10-25")).toBe("2026-10-25");
  });

  it("keeps the day at the edges of the day and of the year", () => {
    expect(incidentDayKey("2026-12-31T23:59:59")).toBe("2026-12-31");
    expect(incidentDayKey("2027-01-01T00:00:00")).toBe("2027-01-01");
  });

  it.each(["", "soon", "25/10/2026", "2026-10", "2026-13-01T00:00:00", "2026-02-30T00:00:00"])(
    "is null for %j, so the chip links to /insiden instead of a wrong day",
    (value) => {
      expect(incidentDayKey(value)).toBeNull();
    },
  );

  it("accepts 29 February only in a leap year", () => {
    expect(incidentDayKey("2028-02-29T00:00:00")).toBe("2028-02-29");
    expect(incidentDayKey("2027-02-29T00:00:00")).toBeNull();
  });

  it.each(["UTC", "Asia/Kuala_Lumpur", "Pacific/Kiritimati", "Pacific/Pago_Pago"])(
    "names the same day under TZ=%s, because it reads the string and never a Date",
    (zone) => {
      // +14:00 and -11:00 are the two extremes: a `new Date(string)` round trip would move a
      // midnight-adjacent datetime onto the neighbouring day in at least one of them.
      withTimeZone(zone, () => {
        expect(incidentDayKey("2026-10-24T23:59:59")).toBe("2026-10-24");
        expect(incidentDayKey("2026-10-25T00:00:00")).toBe("2026-10-25");
      });
    },
  );
});

describe("incidentDayLabel", () => {
  it('writes the day the way the board does: weekday, day, month ("Sat 24 Oct")', () => {
    expect(incidentDayLabel("2026-10-24T22:00:00")).toBe("Sat 24 Oct");
    expect(incidentDayLabel("2026-10-25T00:00:00")).toBe("Sun 25 Oct");
    expect(incidentDayLabel("2027-01-01T06:00:00")).toBe("Fri 1 Jan");
  });

  it("is null for an unreadable datetime", () => {
    expect(incidentDayLabel("soon")).toBeNull();
    expect(incidentDayLabel("2026-02-30T00:00:00")).toBeNull();
  });

  it.each(["UTC", "Asia/Kuala_Lumpur", "Pacific/Kiritimati", "Pacific/Pago_Pago"])(
    "reads the same weekday and day under TZ=%s",
    (zone) => {
      withTimeZone(zone, () => {
        expect(incidentDayLabel("2026-10-24T23:59:59")).toBe("Sat 24 Oct");
        expect(incidentDayLabel("2026-10-25T00:00:00")).toBe("Sun 25 Oct");
      });
    },
  );
});

describe("incident severity", () => {
  it("reuses the colours /insiden already uses: red, amber, neutral", () => {
    expect(incidentSeverityVariant("MAJOR")).toBe("destructive");
    expect(incidentSeverityVariant("MINOR")).toBe("warning");
    expect(incidentSeverityVariant("OTHERS")).toBe("neutral");
  });

  it("says the severity in words, so colour is never the only channel", () => {
    expect(incidentSeverityLabel("MAJOR")).toBe("Major");
    expect(incidentSeverityLabel("MINOR")).toBe("Minor");
    expect(incidentSeverityLabel("OTHERS")).toBe("Other");
  });

  it("degrades a severity this client does not know to neutral and Other", () => {
    // A backend enum value added before the frontend learns it must not render an unstyled, unlabelled
    // chip. The cast stands in for exactly that wire value.
    const unknown = "CRITICAL" as unknown as Parameters<typeof incidentSeverityLabel>[0];

    expect(incidentSeverityVariant(unknown)).toBe("neutral");
    expect(incidentSeverityLabel(unknown)).toBe("Other");
  });
});
