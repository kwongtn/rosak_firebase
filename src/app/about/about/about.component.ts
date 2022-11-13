import { Observable, Subscription } from "rxjs";
import build from "src/build";
import { environment } from "src/environments/environment";

import { Component, OnDestroy, OnInit } from "@angular/core";
import { AngularFirestore } from "@angular/fire/compat/firestore";

import { Personnel, PublicAboutDocument } from "../models/firestore";
import { sortOrder } from "../utils";

@Component({
    selector: "app-about",
    templateUrl: "./about.component.html",
    styleUrls: ["./about.component.scss"],
})
export class AboutComponent implements OnInit, OnDestroy {
    showLoading: boolean = true;
    $items!: Observable<PublicAboutDocument | undefined>;
    itemSubscription!: Subscription;
    
    semaphoreBadgeKey: string = environment.semaphore.badgeKey;
    branchName: string = build.git.branch;

    personnel: Personnel[] = [];

    constructor(firestore: AngularFirestore) {
        const itemDoc = firestore.doc<PublicAboutDocument>("public/about");

        this.$items = itemDoc.valueChanges();

        this.itemSubscription = this.$items.subscribe((value) => {
            console.log(value);

            this.personnel = sortOrder(
                (value as PublicAboutDocument).personnel
            );

            this.showLoading = false;
        });
    }

    ngOnInit(): void {
        return;
    }

    ngOnDestroy(): void {
        this.itemSubscription.unsubscribe();
    }
}
