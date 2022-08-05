interface PersonnelSocial {
    link: string;
    name: string;
    type: "github" | "linkedin";
}

export interface Personnel {
    name: string;
    avatar: string;
    title: string;
    description: string;
    socials: PersonnelSocial[];
}

export interface TechStack {
    description: string;
    name: string;
    iconUrl: string;
    url: string;
}

export interface PublicAboutDocument {
    personnel: Personnel[];
    techStacks: TechStack[];
    aboutProject: string;
}
