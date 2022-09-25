import firebase from "firebase/compat/app";
import { BehaviorSubject, Observable } from "rxjs";

import { Injectable } from "@angular/core";
import { AngularFireAuth } from "@angular/fire/compat/auth";
import { AngularFirestore } from "@angular/fire/compat/firestore";
import * as Sentry from "@sentry/browser";

import { ToastService } from "../toast/toast.service";

export interface UserAuthData {
    permissions?: {
        admin?: boolean;
    };
}

@Injectable({
    providedIn: "root",
})
export class AuthService {
    userData: BehaviorSubject<firebase.User | null | undefined> =
        new BehaviorSubject<firebase.User | null | undefined>(undefined);

    userAuth: BehaviorSubject<UserAuthData | null | undefined> =
        new BehaviorSubject<UserAuthData | null | undefined>(null);
    public readonly userAuth$: Observable<UserAuthData | undefined | null> =
        this.userAuth.asObservable();

    loginViaLoginFunction: boolean = false;

    constructor(
        private angularFireAuth: AngularFireAuth,
        private toastService: ToastService,
        private firestore: AngularFirestore
    ) {
        this.angularFireAuth.onAuthStateChanged(
            (user) => {
                this.userData.next(user);
            },
            (error) => {
                this.toastService.addToast({
                    severity: "error",
                    summary: "Authentication Error",
                    content: error.message,
                });
            }
        );

        this.userData.subscribe(async (user) => {
            this.sentrySetUser(user);

            if (user) {
                const uid = user.uid;
                const itemDoc = firestore.collection("users").doc(uid);

                itemDoc.valueChanges().subscribe((value) => {
                    console.log("Permissions: ", value);

                    this.userAuth.next(value as UserAuthData);
                });
            } else if (user === null) {
                this.userAuth.next(undefined);
            }

            console.log("User: ", user);
        });
    }

    login() {
        this.angularFireAuth
            .signInWithPopup(new firebase.auth.GoogleAuthProvider())
            .then((res) => {
                let toastMessage: string;
                if (res.additionalUserInfo) {
                    if (res.additionalUserInfo.isNewUser) {
                        toastMessage = "Welcome!";
                    } else {
                        toastMessage =
                            "Welcome back, " +
                            (res.additionalUserInfo.profile as any).given_name;
                    }
                } else {
                    toastMessage = "";
                }

                this.toastService.addToast({
                    severity: "success",
                    summary: "Login Successful",
                    content: toastMessage,
                });
                console.log(res);
            })
            .catch((reason) => {
                console.log("Login failed: ", reason);
                this.toastService.addToast({
                    severity: "error",
                    summary: "Login Error",
                    content: reason.message,
                });
            });
    }

    logout() {
        this.angularFireAuth
            .signOut()
            .then(() => {
                this.userData.next(null);
                this.toastService.addToast({
                    severity: "success",
                    summary: "Logout Successful",
                    content: "Hope to see you again soon!",
                });
            })
            .catch((reason) => {
                console.log("Logout failed: ", reason);
                this.toastService.addToast({
                    severity: "error",
                    summary: "Logout Error",
                    content: reason.message,
                });
            });
    }

    sentrySetUser(user: firebase.User | null | undefined) {
        if (user) {
            Sentry.setUser({
                email: user?.email?.toString(),
                id: user?.uid,
                ip_address: "{{auto}}",
            });
        } else {
            Sentry.setUser(null);
        }
    }
}
