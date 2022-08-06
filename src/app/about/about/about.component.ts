import { Observable, Subscription } from "rxjs";

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
    $items!: Observable<PublicAboutDocument | undefined>;
    itemSubscription!: Subscription;

    personnel: Personnel[] = [];

    constructor(firestore: AngularFirestore) {
        const itemDoc = firestore.doc<PublicAboutDocument>("public/about");

        this.$items = itemDoc.valueChanges();

        this.itemSubscription = this.$items.subscribe((value) => {
            console.log(value);

            this.personnel = sortOrder(
                (value as PublicAboutDocument).personnel
            );
        });
    }

    ngOnInit(): void {
        return;
    }

    ngOnDestroy(): void {
        this.itemSubscription.unsubscribe();
    }
}
