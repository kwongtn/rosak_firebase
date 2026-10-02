import { incidentLinkLine, toLocalDateTimeLabel } from "./incident-link-line.util";

describe("toLocalDateTimeLabel", () => {
  it("formats as yyyy-mm-dd hh:mm in local time", () => {
    const input = "2026-08-01T10:30:14Z";
    const date = new Date(input);
    const expected = [
      date.getFullYear(),
      "-",
      String(date.getMonth() + 1).padStart(2, "0"),
      "-",
      String(date.getDate()).padStart(2, "0"),
      " ",
      String(date.getHours()).padStart(2, "0"),
      ":",
      String(date.getMinutes()).padStart(2, "0"),
    ].join("");
    expect(toLocalDateTimeLabel(input)).toBe(expected);
    expect(toLocalDateTimeLabel(input)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("returns empty string when the value is missing or invalid", () => {
    expect(toLocalDateTimeLabel(undefined)).toBe("");
    expect(toLocalDateTimeLabel(null)).toBe("");
    expect(toLocalDateTimeLabel("")).toBe("");
    expect(toLocalDateTimeLabel("not a date")).toBe("");
  });
});

describe("incidentLinkLine", () => {
  it("splits a URL-only line into bold domain + paler remainder", () => {
    const line = incidentLinkLine({
      url: "https://news.example.com/r/posts/123?src=rss",
      title: "",
      created: "2026-08-01T10:30:14Z",
    });

    expect(line.displayText).toBe("https://news.example.com/r/posts/123?src=rss");
    expect(line.domain).toBe("news.example.com");
    expect(line.restPath).toBe("/r/posts/123?src=rss");
    expect(line.faviconUrl).toBe(
      "https://www.google.com/s2/favicons?domain=news.example.com&sz=32",
    );
    expect(line.url).toBe("https://news.example.com/r/posts/123?src=rss");
    expect(line.isPending).toBe(false);
  });

  it("uses the title as displayText and drops the domain split", () => {
    const line = incidentLinkLine({
      url: "https://news.example.com/r/posts/123",
      title: "  KL Sentral delay thread  ",
      created: "2026-08-01T10:30:14Z",
      status: "pending_approval",
    });

    expect(line.displayText).toBe("KL Sentral delay thread");
    expect(line.domain).toBeNull();
    expect(line.restPath).toBe("");
    expect(line.faviconUrl).toBe(
      "https://www.google.com/s2/favicons?domain=news.example.com&sz=32",
    );
  });

  it("falls back gracefully on invalid/empty URLs (no throw, no favicon)", () => {
    expect(incidentLinkLine({ url: "" }).displayText).toBe("");
    expect(incidentLinkLine({ url: "not a url" }).domain).toBeNull();
    expect(incidentLinkLine({ url: "not a url" }).faviconUrl).toBe("");
    expect(incidentLinkLine({ url: "mailto:user@example.com" }).faviconUrl).toBe("");
    expect(incidentLinkLine({ url: "not a url", title: "A title" }).displayText).toBe("A title");
  });

  it("flags user-submitted links in both status casings and only then", () => {
    expect(incidentLinkLine({ url: "https://x.com/1", status: "PENDING_APPROVAL" }).isPending).toBe(
      true,
    );
    expect(incidentLinkLine({ url: "https://x.com/1", status: "pending_approval" }).isPending).toBe(
      true,
    );
    expect(incidentLinkLine({ url: "https://x.com/1", status: "LIVE" }).isPending).toBe(false);
    expect(incidentLinkLine({ url: "https://x.com/1", status: "live" }).isPending).toBe(false);
    expect(incidentLinkLine({ url: "https://x.com/1" }).isPending).toBe(false);
  });

  it("labels the row with the event time, not the submission time", () => {
    const line = incidentLinkLine({
      url: "https://news.example.com/r/posts/1",
      created: "2026-08-01T10:30:00Z",
      occurredAt: "2026-07-30T23:15:00Z",
    });
    expect(line.datetimeLabel).toBe(toLocalDateTimeLabel("2026-07-30T23:15:00Z"));
    // The fixture has to actually disagree, or this assertion would pass under either field.
    expect(line.datetimeLabel).not.toBe(toLocalDateTimeLabel("2026-08-01T10:30:00Z"));
  });

  it("falls back to the submission time when the host did not select occurredAt", () => {
    // `occurredAt` is optional on the shared structural type so any document, host or fixture that
    // binds a link to a card type-checks, so a row without it must still carry a real timestamp.
    // (This is NOT a licence to drop the nested per-incident `links` sub-select that DOES request
    // it — see the case above, where the split labelled one list's first page by `created`.)
    const line = incidentLinkLine({
      url: "https://news.example.com/r/posts/1",
      created: "2026-08-01T10:30:00Z",
      occurredAt: undefined,
    });
    expect(line.datetimeLabel).toBe(toLocalDateTimeLabel("2026-08-01T10:30:00Z"));
  });

  it("documents the sort key: the label comes from the displayed instant, the row sorts by occurredAt DESC", () => {
    const older = incidentLinkLine({
      url: "https://a.example.com",
      created: "2026-08-01T08:00:00Z",
      occurredAt: "2026-07-31T08:00:00Z",
    });
    const newer = incidentLinkLine({
      url: "https://b.example.com",
      created: "2026-07-31T08:00:00Z",
      occurredAt: "2026-08-02T08:00:00Z",
    });
    // The label is a plain string; the backend owns ordering (occurredAt DESC, id DESC).
    // `created` is deliberately inverted here — the labels must NOT follow it.
    expect(newer.datetimeLabel > older.datetimeLabel).toBe(true);
    expect(newer.datetimeLabel).toBe(toLocalDateTimeLabel("2026-08-02T08:00:00Z"));
    expect(newer.datetimeLabel).not.toBe(toLocalDateTimeLabel("2026-07-31T08:00:00Z"));
  });
});
