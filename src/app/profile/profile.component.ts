import { QueryRef } from "apollo-angular";
import { Subscription } from "rxjs";
import { AuthService } from "src/app/services/auth.service";

import { Component, OnDestroy, OnInit } from "@angular/core";
import { User } from "@angular/fire/auth";

import {
    GetUserDataService,
    UserDataResponseUser,
} from "./services/get-user-data.service";
import {
    SpottingTrendsComponent,
} from "./spotting-trends/spotting-trends.component";
import { ProfileSpottingsComponent } from "./spottings/spottings.component";
import { ProfileUserComponent } from "./user/user.component";

@Component({
    selector: "profile-main",
    templateUrl: "./profile.component.html",
    styleUrls: ["./profile.component.scss"],
    standalone: true,
    imports: [
        ProfileUserComponent,
        ProfileSpottingsComponent,
        SpottingTrendsComponent,
    ],
})
export class ProfileMainComponent implements OnInit, OnDestroy {
    user!: User;
    loading = true;
    watchQueryOption!: QueryRef<any>;
    data: UserDataResponseUser | undefined = undefined;

    private mainQuerySubscription!: Subscription;

    constructor(
        private authService: AuthService,
        private getUserDataGql: GetUserDataService
    ) {
        this.user = this.authService.userData.value as User;
    }

    async ngOnInit() {
        const authKey = await this.authService.getIdToken();

        this.mainQuerySubscription = this.getUserDataGql
            .watch(
                {
                    typeGroup: true,
                    freeRange: true,
                },
                {
                    context: {
                        headers: {
                            "firebase-auth-key": authKey,
                        },
                    },
                    fetchPolicy: "network-only",
                }
            )
            .valueChanges.subscribe(({ data, loading }) => {
                this.loading = loading;

                this.data = data.user;
            });
    }

    ngOnDestroy(): void {
        this.mainQuerySubscription?.unsubscribe();
    }
}
