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
    order: number;
    socials: PersonnelSocial[];
}

export interface TechStack {
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
    projects: Project[];
}
