import build from "src/build";
import { environment } from "src/environments/environment";

import { Component, OnDestroy, OnInit } from "@angular/core";
import {
    doc,
    Firestore,
    onSnapshot,
    Unsubscribe,
} from "@angular/fire/firestore";

import { PublicAboutDocument } from "./models/firestore";

@Component({
    selector: "app-about",
    templateUrl: "./about.component.html",
    styleUrls: ["./about.component.scss"],
})
export class AboutComponent implements OnInit, OnDestroy {
    showLoading: boolean = true;
    items: PublicAboutDocument | undefined = undefined;

    semaphoreBadgeKey: string = environment.semaphore.badgeKey;
    branchName: string = build.git.branch;

    unsubscribe: Unsubscribe | undefined = undefined;

    constructor(firestore: Firestore) {
        this.unsubscribe = onSnapshot(
            doc(firestore, "public", "about"),
            (doc) => {
                if (doc.exists()) {
                    this.items = doc.data() as PublicAboutDocument;

                    this.showLoading = false;
                }
            }
        );
    }

    ngOnInit(): void {
        return;
    }

    ngOnDestroy(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}
