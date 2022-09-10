import { Observable, Subscription } from "rxjs";

import { Component, OnInit } from "@angular/core";
import { AngularFirestore } from "@angular/fire/compat/firestore";

import {
    GdprDetailChildrenPanel,
    GdprDetailPanel,
    PublicGdprDocument,
} from "../models/firestore";

@Component({
    selector: "compliance-gdpr",
    templateUrl: "./gdpr.component.html",
    styleUrls: ["./gdpr.component.scss"],
})
export class GdprComponent implements OnInit {
    showLoading: boolean = true;
    $items!: Observable<PublicGdprDocument | undefined>;
    itemSubscription!: Subscription;

    definition: string = "";
    intro: string = "";
    details: GdprDetailPanel[] = [];

    constructor(firestore: AngularFirestore) {
        const itemDoc = firestore.doc<PublicGdprDocument>("public/gdpr");

        this.$items = itemDoc.valueChanges();

        this.itemSubscription = this.$items.subscribe((value) => {
            console.log(value);

            this.definition = value?.definition ?? "";
            this.intro = value?.intro ?? "";

            this.details = (value?.details ?? []).map((value) => {
                return {
                    ...value,
                    children: value.children.map((child) => {
                        return { ...child, isCollapsed: !true };
                    }),
                } as GdprDetailPanel;
            });

            this.showLoading = false;
        });
    }

    ngOnInit(): void {
        return;
    }

    toggle($event: any, child: GdprDetailChildrenPanel) {
        child.isCollapsed = $event;
    }
}
