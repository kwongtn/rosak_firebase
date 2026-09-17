import { describe, expect, it } from "vitest";
import { PublicAboutDocument } from "./about.model";
import {
  draftFromDoc,
  emptyPersonnel,
  emptyProject,
  emptySocial,
  emptyTechStack,
  filterAndSortProjects,
  filterPersonnel,
  filterTechStacks,
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
      order: 2,
      socials: [],
    },
    { name: "First", avatar: "", title: "", description: "", display: true, order: 1, socials: [] },
    { name: "", avatar: "", title: "", description: "", display: true, order: 3, socials: [] },
  ],
  techStacks: [
    { name: "Angular", description: "Framework", iconUrl: "", url: "" },
    { name: "PostGIS", description: "Database", iconUrl: "", url: "" },
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
    expect(draft.aboutProject).toBe("x");
  });
});

describe("sanitizeDraft", () => {
  it("drops nameless placeholder rows and leaves no undefined values", () => {
    const draft = draftFromDoc(doc);
    draft.projects.push(emptyProject());
    draft.personnel.push(emptyPersonnel(99));
    draft.techStacks.push(emptyTechStack());
    draft.personnel[0].socials = [
      emptySocial(),
      { name: "GitHub", link: "https://github.com/x", type: "github" },
    ];

    const clean = sanitizeDraft(draft);
    expect(clean.projects.map((p) => p.name)).toEqual(["Beta", "Alpha", "Hidden"]);
    expect(clean.personnel.map((p) => p.name)).toEqual(["Second", "First"]);
    expect(clean.techStacks.map((s) => s.name)).toEqual(["Angular", "PostGIS"]);
    // firestore rejects undefined — every field must be defined, empty socials dropped
    expect(clean.personnel[0].socials).toEqual([
      { name: "GitHub", link: "https://github.com/x", type: "github" },
    ]);
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
});

describe("filterTechStacks", () => {
  it("matches name and description", () => {
    expect(filterTechStacks(doc.techStacks, "Framework").map((s) => s.name)).toEqual(["Angular"]);
    expect(filterTechStacks(doc.techStacks, "angular").map((s) => s.name)).toEqual(["Angular"]);
  });
});
