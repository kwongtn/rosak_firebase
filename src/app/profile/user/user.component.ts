import { QueryRef } from "apollo-angular";
import firebase from "firebase/compat/app";
import { Subscription } from "rxjs";
import { AuthService } from "src/app/services/auth/auth.service";

import { Component, OnDestroy, OnInit } from "@angular/core";

import { GetUserDataService } from "../services/get-user-data.service";

interface UserData {
    firebaseId: string;
    spottingsCount: number;
}

@Component({
    selector: "profile-user",
    templateUrl: "./user.component.html",
    styleUrls: ["./user.component.scss"],
})
export class ProfileUserComponent implements OnInit, OnDestroy {
    user!: firebase.User;
    watchQueryOption!: QueryRef<any>;
    displayData: UserData | undefined = undefined;
    loading = true;

    private mainQuerySubscription!: Subscription;

    constructor(
        private authService: AuthService,
        private getUserDataGql: GetUserDataService
    ) {
        this.user = this.authService.userData.value as firebase.User;
    }

    async ngOnInit() {
        const authKey = await this.authService.getIdToken();

        this.mainQuerySubscription = this.getUserDataGql
            .watch(
                {},
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

                this.displayData = data.user;
            });
    }

    ngOnDestroy(): void {
        this.mainQuerySubscription?.unsubscribe();
    }
}
