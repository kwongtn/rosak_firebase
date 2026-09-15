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

  it("documents the sort key: label comes from created, the row sorts by created DESC", () => {
    const older = incidentLinkLine({
      url: "https://a.example.com",
      created: "2026-08-01T08:00:00Z",
    });
    const newer = incidentLinkLine({
      url: "https://b.example.com",
      created: "2026-08-02T08:00:00Z",
    });
    // The label is a plain string; the backend owns ordering (created DESC, id DESC).
    expect(newer.datetimeLabel > older.datetimeLabel).toBe(true);
  });
});
