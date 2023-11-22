
import { Component, OnDestroy, OnInit } from "@angular/core";
import {
    doc,
    Firestore,
    onSnapshot,
    Unsubscribe,
} from "@angular/fire/firestore";

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
export class GdprComponent implements OnInit, OnDestroy {
    showLoading: boolean = true;
    items: PublicGdprDocument | undefined;

    definition: string = "";
    intro: string = "";
    details: GdprDetailPanel[] = [];

    unsubscribe: Unsubscribe | undefined = undefined;

    constructor(firestore: Firestore) {
        this.unsubscribe = onSnapshot(
            doc(firestore, "public", "gdpr"),
            (doc) => {
                if (doc.exists()) {
                    this.items = doc.data() as PublicGdprDocument;

                    this.definition = this.items?.definition ?? "";
                    this.intro = this.items?.intro ?? "";

                    this.details = (this.items?.details ?? []).map((value) => {
                        return {
                            ...value,
                            children: value.children.map((child) => {
                                return { ...child, isCollapsed: !true };
                            }),
                        } as GdprDetailPanel;
                    });

                    this.showLoading = false;
                }
            }
        );
    }

    ngOnInit(): void {
        return;
    }

    toggle($event: any, child: GdprDetailChildrenPanel) {
        child.isCollapsed = $event;
    }

    ngOnDestroy(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}
