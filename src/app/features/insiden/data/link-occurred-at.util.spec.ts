import { describe, expect, it } from "vitest";
import { isoToOccurredAtInput, occurredAtInputToIso } from "./link-occurred-at.util";

/**
 * Expectations here come in two kinds, and conflating them is what put a wall-clock string
 * assertion into this file in the first place — it passed on the author's
 * `Asia/Kuala_Lumpur` laptop and failed in CI, which runs `ubuntu-latest` in **UTC** with no
 * `TZ` pinned anywhere in the repo. The honest split:
 *
 *   - NAIVE inputs (`"2026-09-30T14:05:00"`, what the backend actually sends) are TZ-independent
 *     BY CONSTRUCTION: the formatter reads the local getters, and an offset-free ISO parses as
 *     local time, so the digits pass through unchanged no matter where the runner is. Those cases
 *     are pinned to the literal string, and `withTimeZone` proves it in two foreign zones.
 *   - OFFSET-bearing inputs (`...Z`, `+08:00`) have no timezone-independent STRING. Their correct
 *     answer is definitionally "the viewer's local rendering of that instant", so they are asserted
 *     BY INSTANT — the value handed back to the control must denote the instant that came in.
 *
 * Anything else about an offset case is a claim about one runner's wall clock. The ones that are
 * worth making (the offset really is honoured, not echoed) are pinned inside an explicit zone
 * instead, so they hold everywhere.
 */

/**
 * Runs `body` with the runner's zone forced to `tz`, then restores whatever was there before.
 *
 * `process.env.TZ` is consulted per-`Date` by Node (assigning it invalidates V8's cached zone), so
 * this works in ANY runner — including the `ubuntu-latest` CI box, which is UTC. It exists because
 * some of the expectations below are only *checkable* in a non-UTC zone: the correct rendering of
 * an offset-bearing instant and the "just echo the digits back" bug produce the SAME STRING when
 * the viewer's zone happens to be +00:00, so a string assertion written that way is silently
 * vacuous in CI while passing locally — the exact failure this file had.
 *
 * The two layers together are what make the suite honest: the zone-pinned cases prove the offset
 * is genuinely honoured (and go red if it ever is not, everywhere), and the zone-free cases assert
 * the TZ-INDEPENDENT property the control is actually bound to — the value it ends up holding
 * denotes the instant that came in.
 */
function withTimeZone(tz: string, body: () => void): void {
  // Index-signature access (`process.env["TZ"]`, not `.TZ`) — `noPropertyAccessFromIndexSignature`
  // is one of the few compiler flags this repo does enforce.
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

describe("isoToOccurredAtInput", () => {
  it("formats a naive API instant as the same wall time in a datetime-local value", () => {
    // The backend's actual wire shape: naive, no offset. Must survive unshifted — this is the
    // case an 8-hour bug would break, in either direction.
    expect(isoToOccurredAtInput("2026-09-30T14:05:00")).toBe("2026-09-30T14:05");
    // And it must be the SAME STRING in a foreign zone, not merely an equal instant: this is
    // the pass-through the production contract depends on (the column is naive local wall
    // time), and a formatter that quietly started rendering in UTC would still satisfy an
    // instant comparison in a UTC+8 zone.
    withTimeZone("UTC", () => {
      expect(isoToOccurredAtInput("2026-09-30T14:05:00")).toBe("2026-09-30T14:05");
    });
    withTimeZone("America/New_York", () => {
      expect(isoToOccurredAtInput("2026-09-30T14:05:00")).toBe("2026-09-30T14:05");
    });
  });

  it("drops seconds and sub-second precision the control cannot represent", () => {
    expect(isoToOccurredAtInput("2026-09-30T14:05:59")).toBe("2026-09-30T14:05");
    expect(isoToOccurredAtInput("2026-09-30T14:05:00.123456")).toBe("2026-09-30T14:05");
  });

  it("treats a trailing Z as a real UTC offset, not as naive wall time", () => {
    // The backend sends naive strings, but a `Z` anywhere in a payload is information, not
    // decoration: 14:05 UTC is a different instant from 14:05 local, so the formatter must
    // resolve it into the viewer's clock rather than echo the digits back. Pinned inside a
    // fixed zone, because in a +00:00 runner the correct answer and the naive echo are the
    // SAME STRING and no assertion can tell them apart.
    withTimeZone("Asia/Kuala_Lumpur", () => {
      expect(isoToOccurredAtInput("2026-09-30T14:05:00Z")).toBe("2026-09-30T22:05");
    });
    // The timezone-independent half, and the property the control is actually bound to:
    // whatever the viewer's zone, the value the input ends up holding denotes the instant
    // that came in.
    const rendered = isoToOccurredAtInput("2026-09-30T14:05:00Z");
    expect(new Date(rendered).getTime()).toBe(new Date("2026-09-30T14:05:00Z").getTime());
  });

  it("returns an empty string for unset and unparseable input so the control stays usable", () => {
    expect(isoToOccurredAtInput(null)).toBe("");
    expect(isoToOccurredAtInput(undefined)).toBe("");
    expect(isoToOccurredAtInput("")).toBe("");
    expect(isoToOccurredAtInput("not a datetime")).toBe("");
  });

  it("resolves an explicit offset into the viewer's own local wall time", () => {
    // Same instant, two spellings: the formatter must agree on the instant it shows even
    // though the raw strings differ, and must NOT echo the offset through untouched.
    const withOffset = isoToOccurredAtInput("2026-09-30T14:05:00+00:00");
    expect(new Date(withOffset).getTime()).toBe(new Date("2026-09-30T14:05:00+00:00").getTime());
    // An offset that already matches the viewer's zone must not shift the wall clock — and that
    // statement is only expressible AT ALL in that zone, so it is pinned there.
    withTimeZone("Asia/Kuala_Lumpur", () => {
      expect(isoToOccurredAtInput("2026-09-30T14:05:00+08:00")).toBe("2026-09-30T14:05");
    });
    // …while in a different zone the very same input renders in THAT zone. The pair is what
    // pins the invariant — the rendered value denotes the input's instant — without hard-coding
    // one runner's wall clock as if it were universal.
    withTimeZone("UTC", () => {
      const rendered = isoToOccurredAtInput("2026-09-30T14:05:00+08:00");
      expect(rendered).toBe("2026-09-30T06:05");
      expect(new Date(rendered).getTime()).toBe(new Date("2026-09-30T14:05:00+08:00").getTime());
    });
  });

  it("handles midnight and end-of-day boundaries without rolling over", () => {
    expect(isoToOccurredAtInput("2026-09-30T00:00:00")).toBe("2026-09-30T00:00");
    expect(isoToOccurredAtInput("2026-09-30T23:59:00")).toBe("2026-09-30T23:59");
    expect(isoToOccurredAtInput("2026-01-01T00:05:00")).toBe("2026-01-01T00:05");
    expect(isoToOccurredAtInput("2026-12-31T23:05:00")).toBe("2026-12-31T23:05");
  });

  it("zero-pads single-digit months, days, hours and minutes", () => {
    // Without padding the value is not a valid datetime-local value at all and the control
    // silently discards it.
    expect(isoToOccurredAtInput("2026-02-03T04:05:00")).toBe("2026-02-03T04:05");
  });
});

describe("occurredAtInputToIso", () => {
  it("normalises a datetime-local value to a full naive ISO wall time", () => {
    expect(occurredAtInputToIso("2026-09-30T14:05")).toBe("2026-09-30T14:05:00");
    expect(occurredAtInputToIso("2026-09-30T14:05:30")).toBe("2026-09-30T14:05:30");
  });

  it("never adds an offset or converts to UTC", () => {
    // The single most important assertion in this file: a `Z` or a +08:00 here would move every
    // stored event time by 8 hours, because the backend column is naive local wall time.
    const sent = occurredAtInputToIso("2026-09-30T14:05");
    expect(sent).not.toContain("Z");
    expect(sent).not.toContain("+");
    // And the value the server parses is the same wall clock the user typed.
    expect(new Date(sent as string).getHours()).toBe(14);
    expect(new Date(sent as string).getMinutes()).toBe(5);
  });

  it("maps an empty value to null — 'unset', which the backend reads as the submission instant", () => {
    expect(occurredAtInputToIso("")).toBeNull();
    expect(occurredAtInputToIso("   ")).toBeNull();
  });

  it("maps null/undefined input to null too (strictNullChecks is OFF, so guard explicitly)", () => {
    expect(occurredAtInputToIso(null)).toBeNull();
    expect(occurredAtInputToIso(undefined)).toBeNull();
  });

  it("passes an unrecognised value through instead of silently resetting the timestamp", () => {
    // `null` is destructive on update (it resets occurred_at to the row's created), so a typo
    // must surface as a DateTime rejection, never as a quiet reset.
    expect(occurredAtInputToIso("30/09/2026")).toBe("30/09/2026");
    expect(occurredAtInputToIso("2026-09-30")).toBe("2026-09-30");
    expect(occurredAtInputToIso("2026-09-30T14:05:00Z")).toBe("2026-09-30T14:05:00Z");
  });

  it("round-trips with isoToOccurredAtInput for every value a control can hold", () => {
    // Hydrate an existing row, save it untouched: the instant must not drift.
    for (const apiIso of [
      "2026-09-30T14:05:00",
      "2026-09-30T00:00:00",
      "2026-09-30T23:59:00",
      "2026-01-01T00:05:00",
      "2026-12-31T23:05:00",
    ]) {
      expect(occurredAtInputToIso(isoToOccurredAtInput(apiIso))).toBe(apiIso);
    }
  });
});
