/** Shape of the live Firestore doc at `public/about` — ported from the old app's
 * `models/firestore.ts`. This is admin-edited CMS content, not something this app writes. */
export interface PersonnelSocial {
  link: string;
  name: string;
  type: "github" | "linkedin" | "instagram";
}

export interface Personnel {
  name: string;
  avatar: string;
  title: string;
  description: string;
  display: boolean;
  /** Manually placed in the collapsed "Retired" group on /about. */
  retired: boolean;
  /** Period served, month precision "YYYY-MM". Empty endDate = still serving ("Present"). */
  startDate: string;
  endDate: string;
  order: number;
  socials: PersonnelSocial[];
}

export interface TechStack {
  name: string;
  description: string;
  iconUrl: string;
  url: string;
}

export interface CommunityProject {
  name: string;
  description: string;
  iconUrl: string;
  url: string;
}

export type ProjectStatus = "alpha" | "beta" | "stable" | "planned";

export interface Project {
  name: string;
  description: string;
  startDate: string;
  display: boolean;
  status: ProjectStatus;
}

export interface PublicAboutDocument {
  aboutProject: string;
  personnel: Personnel[];
  techStacks: TechStack[];
  communityProjects: CommunityProject[];
  projects: Project[];
}
