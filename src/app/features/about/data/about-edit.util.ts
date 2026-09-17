import {
  Personnel,
  PersonnelSocial,
  Project,
  ProjectStatus,
  PublicAboutDocument,
  TechStack,
} from "./about.model";

/**
 * Pure helpers for the /about admin editor. The `public/about` Firestore doc is hand-edited
 * legacy content: not every entry reliably carries every field (see the `socials ?? []`
 * comment in about.page.ts), so these defensively normalize on read and sanitize on write.
 */

/** Defaults injected when a doc field is missing so the editor can bind every input safely. */
export function draftFromDoc(data: PublicAboutDocument): PublicAboutDocument {
  return {
    aboutProject: data.aboutProject ?? "",
    projects: (data.projects ?? []).map((p) => ({ ...p, description: p.description ?? "" })),
    personnel: (data.personnel ?? []).map((p) => ({
      ...p,
      avatar: p.avatar ?? "",
      title: p.title ?? "",
      description: p.description ?? "",
      socials: (p.socials ?? []).map((s) => ({ ...s })),
    })),
    techStacks: (data.techStacks ?? []).map((s) => ({
      name: s.name ?? "",
      description: s.description ?? "",
      iconUrl: s.iconUrl ?? "",
      url: s.url ?? "",
    })),
  };
}

/**
 * Firestore rejects `undefined` field values, and an admin can leave half-filled rows behind —
 * so drop nameless placeholder rows and coerce every field to a defined value before saving.
 */
export function sanitizeDraft(draft: PublicAboutDocument): PublicAboutDocument {
  return {
    aboutProject: draft.aboutProject ?? "",
    projects: draft.projects
      .filter((p) => p.name.trim() !== "")
      .map((p) => ({
        name: p.name.trim(),
        description: p.description ?? "",
        startDate: p.startDate ?? "",
        display: p.display ?? true,
        status: (p.status ?? "planned") as ProjectStatus,
      })),
    personnel: draft.personnel
      .filter((p) => p.name.trim() !== "")
      .map((p) => ({
        name: p.name.trim(),
        avatar: p.avatar ?? "",
        title: p.title ?? "",
        description: p.description ?? "",
        display: p.display ?? true,
        order: p.order ?? 0,
        socials: (p.socials ?? []).filter((s) => s.name.trim() !== "" && s.link.trim() !== ""),
      })),
    techStacks: draft.techStacks
      .filter((s) => s.name.trim() !== "")
      .map((s) => ({
        name: s.name.trim(),
        description: s.description ?? "",
        iconUrl: s.iconUrl ?? "",
        url: s.url ?? "",
      })),
  };
}

export function emptyProject(): Project {
  return { name: "", description: "", startDate: "", display: true, status: "planned" };
}

export function emptyPersonnel(order: number): Personnel {
  return { name: "", avatar: "", title: "", description: "", display: true, order, socials: [] };
}

export function emptyTechStack(): TechStack {
  return { name: "", description: "", iconUrl: "", url: "" };
}

export function emptySocial(): PersonnelSocial {
  return { name: "", link: "", type: "github" };
}

/** Projects visible on the page, matching the query, newest first by start date. */
export function filterAndSortProjects(projects: Project[], query: string): Project[] {
  const q = query.trim().toLowerCase();
  return projects
    .filter((p) => p.display)
    .filter((p) => !q || [p.name, p.description].some((s) => s?.toLowerCase().includes(q)))
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
}

/** Visible, named personnel matching the query, sorted by `order`, socials normalized. */
export function filterPersonnel(personnel: Personnel[], query: string): Personnel[] {
  const q = query.trim().toLowerCase();
  return [...(personnel ?? [])]
    .filter((p) => p.display && p.name)
    .filter((p) => !q || [p.name, p.title, p.description].some((s) => s?.toLowerCase().includes(q)))
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ ...p, socials: p.socials ?? [] }));
}

export function filterTechStacks(stacks: TechStack[], query: string): TechStack[] {
  const q = query.trim().toLowerCase();
  return (stacks ?? []).filter(
    (s) => !q || [s.name, s.description].some((t) => t?.toLowerCase().includes(q)),
  );
}
