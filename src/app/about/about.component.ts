import { NzGridModule } from "ng-zorro-antd/grid";
import { NzListModule } from "ng-zorro-antd/list";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzTypographyModule } from "ng-zorro-antd/typography";
import build from "src/build";
import { environment } from "src/environments/environment";

import { Component, OnDestroy, OnInit } from "@angular/core";
import {
    doc,
    Firestore,
    onSnapshot,
    Unsubscribe,
} from "@angular/fire/firestore";

import { AvatarCardComponent } from "./avatar-card/avatar-card.component";
import { PublicAboutDocument } from "./models/firestore";
import { ProjectsCardComponent } from "./projects-card/projects-card.component";
import {
    TechstackCardComponent,
} from "./techstack-card/techstack-card.component";

@Component({
    selector: "app-about",
    templateUrl: "./about.component.html",
    styleUrls: ["./about.component.scss"],
    standalone: true,
    imports: [
        AvatarCardComponent,
        NzTypographyModule,
        NzListModule,
        NzGridModule,
        ProjectsCardComponent,
        NzSpinModule,
        TechstackCardComponent,
    ],
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
