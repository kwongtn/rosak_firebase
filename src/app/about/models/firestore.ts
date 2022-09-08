interface PersonnelSocial {
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
    description: string;
    name: string;
    iconUrl: string;
    url: string;
}

export interface Project {
    description: string;
    name: string;
    startDate: Date;
    display: boolean;
    status: "alpha" | "beta" | "stable" | "planned";
}

export interface PublicAboutDocument {
    personnel: Personnel[];
    techStacks: TechStack[];
    projects: Project[];
    aboutProject: string;
}
