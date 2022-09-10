export interface GdprDetailChildren {
    adhered: boolean;
    details: string;
    notes: string | undefined;
    title: string;
}

export interface GdprDetail {
    title: string;
    children: GdprDetailChildren[];
}

export interface GdprDetailChildrenPanel extends GdprDetailChildren {
    isCollapsed: boolean;
}

export interface GdprDetailPanel extends GdprDetail {
    children: GdprDetailChildrenPanel[];
}

export interface PublicGdprDocument {
    definition: string;
    intro: string;
    details: GdprDetail[];
}
