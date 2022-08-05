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

export interface PublicAboutDocument {
    personnel: Personnel[];
    aboutProject: string;
}
