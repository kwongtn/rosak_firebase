import { Observable } from "rxjs";

import { Component, OnInit } from "@angular/core";
import { AngularFirestore } from "@angular/fire/compat/firestore";

import { PublicAboutDocument } from "../models/firestore";

@Component({
    selector: "app-about",
    templateUrl: "./about.component.html",
    styleUrls: ["./about.component.scss"],
})
export class AboutComponent implements OnInit {
    $items!: Observable<PublicAboutDocument | undefined>;

    constructor(firestore: AngularFirestore) {
        const itemDoc = firestore.doc<PublicAboutDocument>("public/about");

        this.$items = itemDoc.valueChanges();

        this.$items.subscribe((value) => {
            console.log(value);
        });
    }

    ngOnInit(): void {
        return;
    }
}
