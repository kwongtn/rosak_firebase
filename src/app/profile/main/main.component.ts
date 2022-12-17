import { QueryRef } from "apollo-angular";
import firebase from "firebase/compat/app";
import { Subscription } from "rxjs";
import { AuthService } from "src/app/services/auth/auth.service";

import { Component, OnDestroy, OnInit } from "@angular/core";

import {
    GetUserDataService,
    UserDataResponseUser,
} from "../services/get-user-data.service";

@Component({
    selector: "profile-main",
    templateUrl: "./main.component.html",
    styleUrls: ["./main.component.scss"],
})
export class ProfileMainComponent implements OnInit, OnDestroy {
    user!: firebase.User;
    loading = true;
    watchQueryOption!: QueryRef<any>;
    data: UserDataResponseUser | undefined = undefined;

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
                {
                    typeGroup: true,
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
