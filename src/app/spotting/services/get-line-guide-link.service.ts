import { doc, Unsubscribe } from "firebase/firestore";

import { Injectable } from "@angular/core";
import { Firestore, onSnapshot } from "@angular/fire/firestore";

interface IGetLineGuideLink {
    [key: number]: string;
}

@Injectable({
    providedIn: "root",
})
export class GetLineGuideLinkService {
    prefix =
        "https://github.com/kwongtn/rosak_firebase/wiki/MLPTF-all-about-Trains";
    guideLinks: IGetLineGuideLink = {};
    unsubscribe: Unsubscribe | undefined = undefined;

    constructor(private firestore: Firestore) {
        this.unsubscribe = onSnapshot(
            doc(this.firestore, "public", "line-guide"),
            (doc) => {
                if (doc.exists()) {
                    this.guideLinks = doc.data() as IGetLineGuideLink;
                }
            }
        );
    }

    getLink(lineId: string): string {
        const lineNo = parseInt(lineId);
        return `${this.prefix}#${this.guideLinks[lineNo] ?? ""}`;
    }

    dispose(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}
