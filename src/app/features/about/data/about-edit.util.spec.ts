import { describe, expect, it } from "vitest";
import { Personnel, PublicAboutDocument } from "./about.model";
import {
  draftFromDoc,
  emptyCommunityProject,
  emptyPersonnel,
  emptyProject,
  emptySocial,
  emptyTechStack,
  filterAndSortProjects,
  filterCommunityProjects,
  filterPersonnel,
  filterTechStacks,
  formatElapsed,
  formatPeriod,
  formatPersonPeriod,
  sanitizeDraft,
} from "./about-edit.util";

const doc: PublicAboutDocument = {
  aboutProject: "A community platform.",
  projects: [
    { name: "Beta", description: "Later", startDate: "2025-06-01", display: true, status: "beta" },
    {
      name: "Alpha",
      description: "Earlier",
      startDate: "2024-01-15",
      display: true,
      status: "alpha",
    },
    { name: "Hidden", description: "", startDate: "", display: false, status: "planned" },
  ],
  personnel: [
    {
      name: "Second",
      avatar: "",
      title: "",
      description: "",
      display: true,
      retired: false,
      startDate: "",
      endDate: "",
      order: 2,
      socials: [],
    },
    {
      name: "First",
      avatar: "",
      title: "",
      description: "",
      display: true,
      retired: false,
      startDate: "",
      endDate: "",
      order: 1,
      socials: [],
    },
    {
      name: "",
      avatar: "",
      title: "",
      description: "",
      display: true,
      retired: false,
      startDate: "",
      endDate: "",
      order: 3,
      socials: [],
    },
  ],
  techStacks: [
    { name: "Angular", description: "Framework", iconUrl: "", url: "" },
    { name: "PostGIS", description: "Database", iconUrl: "", url: "" },
  ],
  communityProjects: [
    {
      name: "Friendly Tracker",
      description: "A sibling community app",
      iconUrl: "",
      url: "https://example.org/tracker",
    },
    {
      name: "Transit Wiki",
      description: "Community documentation",
      iconUrl: "https://example.org/wiki.png",
      url: "https://example.org/wiki",
    },
  ],
};

describe("draftFromDoc", () => {
  it("defaults missing optional fields so the editor can bind every input", () => {
    const draft = draftFromDoc({
      aboutProject: "x",
      personnel: [{ name: "No extras" }],
    } as unknown as PublicAboutDocument);
    expect(draft.personnel[0].socials).toEqual([]);
    expect(draft.personnel[0].description).toBe("");
    expect(draft.personnel[0].retired).toBe(false);
    expect(draft.personnel[0].startDate).toBe("");
    expect(draft.personnel[0].endDate).toBe("");
    expect(draft.communityProjects).toEqual([]);
    expect(draft.aboutProject).toBe("x");
  });
});

describe("sanitizeDraft", () => {
  it("drops nameless placeholder rows and leaves no undefined values", () => {
    const draft = draftFromDoc(doc);
    draft.projects.push(emptyProject());
    draft.personnel.push(emptyPersonnel(99));
    draft.techStacks.push(emptyTechStack());
    draft.communityProjects.push(emptyCommunityProject());
    draft.personnel[0].socials = [
      emptySocial(),
      { name: "GitHub", link: "https://github.com/x", type: "github" },
    ];
    draft.personnel[0].retired = true;
    draft.personnel[0].startDate = " 2019-03 ";
    draft.personnel[0].endDate = "2021-05";

    const clean = sanitizeDraft(draft);
    expect(clean.projects.map((p) => p.name)).toEqual(["Beta", "Alpha", "Hidden"]);
    expect(clean.personnel.map((p) => p.name)).toEqual(["Second", "First"]);
    expect(clean.techStacks.map((s) => s.name)).toEqual(["Angular", "PostGIS"]);
    expect(clean.communityProjects.map((p) => p.name)).toEqual([
      "Friendly Tracker",
      "Transit Wiki",
    ]);
    // firestore rejects undefined — every field must be defined, empty socials dropped
    expect(clean.personnel[0].socials).toEqual([
      { name: "GitHub", link: "https://github.com/x", type: "github" },
    ]);
    expect(clean.personnel[0].retired).toBe(true);
    expect(clean.personnel[0].startDate).toBe("2019-03");
    expect(clean.personnel[0].endDate).toBe("2021-05");
    expect(JSON.parse(JSON.stringify(clean))).toEqual(clean);
  });
});

describe("filterAndSortProjects", () => {
  it("sorts chronologically and hides display:false", () => {
    const result = filterAndSortProjects(doc.projects, "");
    expect(result.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
  });

  it("matches by name/description case-insensitively", () => {
    expect(filterAndSortProjects(doc.projects, "earlier").map((p) => p.name)).toEqual(["Alpha"]);
    expect(filterAndSortProjects(doc.projects, "beta").map((p) => p.name)).toEqual(["Beta"]);
  });
});

describe("filterPersonnel", () => {
  it("sorts by order and drops unnamed entries", () => {
    const result = filterPersonnel(doc.personnel, "");
    expect(result.map((p) => p.name)).toEqual(["First", "Second"]);
  });

  it("defaults socials to an empty array", () => {
    expect(filterPersonnel(doc.personnel, "")[0].socials).toEqual([]);
  });

  it("normalizes retired/startDate/endDate, defaulting a legacy entry without them", () => {
    const legacy = [
      {
        name: "Legacy",
        avatar: "",
        title: "",
        description: "",
        display: true,
        order: 1,
        socials: [],
      },
    ] as unknown as Personnel[];
    const normalized = filterPersonnel(legacy, "")[0];
    expect(normalized.retired).toBe(false);
    expect(normalized.startDate).toBe("");
    expect(normalized.endDate).toBe("");

    const dated = filterPersonnel(
      [{ ...doc.personnel[0], retired: true, startDate: "2020-02", endDate: "2022-11" }],
      "",
    )[0];
    expect(dated.retired).toBe(true);
    expect(dated.startDate).toBe("2020-02");
    expect(dated.endDate).toBe("2022-11");
  });
});

describe("filterTechStacks", () => {
  it("matches name and description", () => {
    expect(filterTechStacks(doc.techStacks, "Framework").map((s) => s.name)).toEqual(["Angular"]);
    expect(filterTechStacks(doc.techStacks, "angular").map((s) => s.name)).toEqual(["Angular"]);
  });
});

describe("filterCommunityProjects", () => {
  it("matches name and description case-insensitively", () => {
    expect(filterCommunityProjects(doc.communityProjects, "tracker").map((p) => p.name)).toEqual([
      "Friendly Tracker",
    ]);
    expect(
      filterCommunityProjects(doc.communityProjects, "documentation").map((p) => p.name),
    ).toEqual(["Transit Wiki"]);
    expect(filterCommunityProjects(doc.communityProjects, "WIKI").map((p) => p.name)).toEqual([
      "Transit Wiki",
    ]);
  });
});

// Fixed clock: 8 Oct 2026. Never rely on the real one.
const NOW = new Date(2026, 9, 8);

describe("formatPeriod", () => {
  it("renders a month-precision range, Present when the end is missing", () => {
    expect(formatPeriod("2024-01", "")).toBe("Jan 2024 - Present");
    expect(formatPeriod("2020-02", "2022-11")).toBe("Feb 2020 - Nov 2022");
  });

  it("returns empty for a missing or unparseable start", () => {
    expect(formatPeriod("", "2022-11")).toBe("");
    expect(formatPeriod("garbage", "")).toBe("");
  });

  it("leniently accepts a day-precision start", () => {
    expect(formatPeriod("2024-01-15", "")).toBe("Jan 2024 - Present");
  });
});

describe("formatElapsed", () => {
  it("humanizes whole months, omitting zero months", () => {
    expect(formatElapsed("2026-08", "", NOW)).toBe("2 months");
    expect(formatElapsed("2026-09", "", NOW)).toBe("1 month");
    expect(formatElapsed("2026-10", "", NOW)).toBe("Less than a month");
    expect(formatElapsed("2024-01", "2025-04", NOW)).toBe("1 year 3 months");
    expect(formatElapsed("2024-01", "2025-01", NOW)).toBe("1 year");
    expect(formatElapsed("2024-01", "", NOW)).toBe("2 years 9 months");
  });

  it("is empty when the start is missing", () => {
    expect(formatElapsed("", "", NOW)).toBe("");
  });
});

describe("formatPersonPeriod", () => {
  it("composes the range and the elapsed tenure", () => {
    expect(formatPersonPeriod({ startDate: "2024-01", endDate: "" }, NOW)).toBe(
      "Jan 2024 - Present · 2 years 9 months",
    );
  });

  it("is empty when there is no period", () => {
    expect(formatPersonPeriod({ startDate: "", endDate: "" }, NOW)).toBe("");
  });
});
