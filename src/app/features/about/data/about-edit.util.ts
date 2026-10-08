import {
  CommunityProject,
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
      retired: p.retired ?? false,
      startDate: p.startDate ?? "",
      endDate: p.endDate ?? "",
      socials: (p.socials ?? []).map((s) => ({ ...s })),
    })),
    techStacks: (data.techStacks ?? []).map((s) => ({
      name: s.name ?? "",
      description: s.description ?? "",
      iconUrl: s.iconUrl ?? "",
      url: s.url ?? "",
    })),
    communityProjects: (data.communityProjects ?? []).map((p) => ({
      name: p.name ?? "",
      description: p.description ?? "",
      iconUrl: p.iconUrl ?? "",
      url: p.url ?? "",
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
        retired: p.retired ?? false,
        startDate: (p.startDate ?? "").trim(),
        endDate: (p.endDate ?? "").trim(),
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
    communityProjects: draft.communityProjects
      .filter((p) => p.name.trim() !== "")
      .map((p) => ({
        name: p.name.trim(),
        description: p.description ?? "",
        iconUrl: p.iconUrl ?? "",
        url: p.url ?? "",
      })),
  };
}

export function emptyProject(): Project {
  return { name: "", description: "", startDate: "", display: true, status: "planned" };
}

export function emptyPersonnel(order: number): Personnel {
  return {
    name: "",
    avatar: "",
    title: "",
    description: "",
    display: true,
    retired: false,
    startDate: "",
    endDate: "",
    order,
    socials: [],
  };
}

export function emptyTechStack(): TechStack {
  return { name: "", description: "", iconUrl: "", url: "" };
}

export function emptyCommunityProject(): CommunityProject {
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
    .map((p) => ({
      ...p,
      retired: !!p.retired,
      startDate: p.startDate ?? "",
      endDate: p.endDate ?? "",
      socials: p.socials ?? [],
    }));
}

export function filterTechStacks(stacks: TechStack[], query: string): TechStack[] {
  const q = query.trim().toLowerCase();
  return (stacks ?? []).filter(
    (s) => !q || [s.name, s.description].some((t) => t?.toLowerCase().includes(q)),
  );
}

export function filterCommunityProjects(
  projects: CommunityProject[],
  query: string,
): CommunityProject[] {
  const q = query.trim().toLowerCase();
  return (projects ?? []).filter(
    (p) => !q || [p.name, p.description].some((t) => t?.toLowerCase().includes(q)),
  );
}

// --- Personnel period display helpers -------------------------------------

/** Fixed month labels so "MMM YYYY" never depends on the runtime locale. */
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Parses a month-precision "YYYY-MM" (leniently "YYYY-MM-DD") to a local-time month start. */
function parseMonth(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})/.exec((value ?? "").trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return undefined;
  // Local-time constructor, NOT `new Date("YYYY-MM")` which parses as UTC.
  return new Date(year, month - 1, 1);
}

/** "Jan 2024 - Present" / "Feb 2020 - Nov 2022", or "" when the start is missing/unparseable. */
export function formatPeriod(startDate: string, endDate: string): string {
  const start = parseMonth(startDate);
  if (!start) return "";
  const startLabel = `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
  const end = parseMonth(endDate);
  const endLabel = end ? `${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}` : "Present";
  return `${startLabel} - ${endLabel}`;
}

/** Humanized whole-month tenure, e.g. "2 years 3 months"; negative spans clamp to "Less than a month". */
export function formatElapsed(startDate: string, endDate: string, now: Date = new Date()): string {
  const start = parseMonth(startDate);
  if (!start) return "";
  const end = parseMonth(endDate) ?? now;
  const months = Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()),
  );
  if (months < 1) return "Less than a month";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? "month" : "months"}`);
  return parts.join(" ");
}

/** Composed "Jan 2024 - Present · 2 years 3 months", or "" when there is no period to show. */
export function formatPersonPeriod(
  person: Pick<Personnel, "startDate" | "endDate">,
  now: Date = new Date(),
): string {
  const startDate = person?.startDate ?? "";
  const endDate = person?.endDate ?? "";
  const period = formatPeriod(startDate, endDate);
  if (!period) return "";
  const elapsed = formatElapsed(startDate, endDate, now);
  return elapsed ? `${period} · ${elapsed}` : period;
}
