import {
  incidentHistoryChangedLabel,
  incidentHistoryDatetimeLabel,
  incidentHistoryLine,
} from "./incident-history-line.util";

describe("incidentHistoryDatetimeLabel", () => {
  it("formats as 'MMM d, y HH:mm' in local time (matches the card's DatePipe convention)", () => {
    const input = "2026-08-01T09:30:00";
    const date = new Date(input);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    expect(incidentHistoryDatetimeLabel(input)).toBe(
      `Aug ${date.getDate()}, ${date.getFullYear()} ${hh}:${mm}`,
    );
  });

  it("returns empty string for a missing or invalid timestamp", () => {
    expect(incidentHistoryDatetimeLabel("")).toBe("");
    expect(incidentHistoryDatetimeLabel("not a date")).toBe("");
  });
});

describe("incidentHistoryChangedLabel", () => {
  it("maps common model fields to readable labels", () => {
    expect(incidentHistoryChangedLabel("start_datetime")).toBe("start time");
    expect(incidentHistoryChangedLabel("title")).toBe("title");
    expect(incidentHistoryChangedLabel("medias")).toBe("photos");
    expect(incidentHistoryChangedLabel("status")).toBe("approval status");
  });

  it("falls back to the raw name with underscores as spaces", () => {
    expect(incidentHistoryChangedLabel("rejection_reason")).toBe("rejection reason");
    expect(incidentHistoryChangedLabel("some_unknown_field")).toBe("some unknown field");
  });
});

describe("incidentHistoryLine", () => {
  const base = { timestamp: "2026-08-01T09:30:00", actor: "alice" };

  it("renders the updated line with actor and readable changed fields", () => {
    expect(
      incidentHistoryLine({
        ...base,
        changeType: "updated",
        changedFields: ["title", "brief"],
      }),
    ).toBe("Last updated Aug 1, 2026 09:30 by alice — changed: title, brief");
  });

  it("prettifies model field names in the changed tail", () => {
    expect(
      incidentHistoryLine({
        ...base,
        changeType: "updated",
        changedFields: ["start_datetime", "impact_factor"],
      }),
    ).toBe("Last updated Aug 1, 2026 09:30 by alice — changed: start time, impact");
  });

  it("omits the changed tail when the entry lists no changed fields", () => {
    expect(incidentHistoryLine({ ...base, changeType: "updated", changedFields: [] })).toBe(
      "Last updated Aug 1, 2026 09:30 by alice",
    );
  });

  it("renders a creation record as 'Created … by …'", () => {
    expect(
      incidentHistoryLine({
        timestamp: "2026-08-01T08:00:00",
        actor: "bob",
        changeType: "created",
        changedFields: ["created"],
      }),
    ).toBe("Created Aug 1, 2026 08:00 by bob");
  });

  it("renders a deletion record ('deleted' — the card's computed hides it upstream)", () => {
    expect(
      incidentHistoryLine({
        timestamp: "2026-08-01T10:00:00",
        actor: "carol",
        changeType: "deleted",
        changedFields: ["deleted"],
      }),
    ).toBe("Deleted Aug 1, 2026 10:00 by carol");
  });

  it("renders 'system' when the actor is null", () => {
    expect(
      incidentHistoryLine({
        timestamp: "2026-08-01T09:30:00",
        actor: null,
        changeType: "created",
        changedFields: ["created"],
      }),
    ).toBe("Created Aug 1, 2026 09:30 by system");
  });
});
