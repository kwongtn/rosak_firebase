import firebase from "firebase/compat/app";
import { BehaviorSubject, Observable, Subscription } from "rxjs";

import { Injectable } from "@angular/core";
import { AngularFireAuth } from "@angular/fire/compat/auth";
import { AngularFirestore } from "@angular/fire/compat/firestore";
import { Router } from "@angular/router";
import * as Sentry from "@sentry/browser";

import { ToastService } from "../toast/toast.service";
import { isUserAllowed } from "./permissions";

export interface UserAuthData {
    permissions?: {
        admin?: boolean;
    };
}

export interface CustomClaims {
    admin?: boolean;
}

@Injectable({
    providedIn: "root",
})
export class AuthService {
    userData: BehaviorSubject<firebase.User | null | undefined> =
        new BehaviorSubject<firebase.User | null | undefined>(undefined);

    customClaims: BehaviorSubject<CustomClaims | undefined> =
        new BehaviorSubject<CustomClaims | undefined>(undefined);

    userAuth: BehaviorSubject<UserAuthData | null | undefined> =
        new BehaviorSubject<UserAuthData | null | undefined>(null);
    public readonly userAuth$: Observable<UserAuthData | undefined | null> =
        this.userAuth.asObservable();

    loginViaLoginFunction: boolean = false;
    userAuthDataSubscription!: Subscription;

    constructor(
        private angularFireAuth: AngularFireAuth,
        private toastService: ToastService,
        private firestore: AngularFirestore,
        private router: Router
    ) {
        this.angularFireAuth.onAuthStateChanged(
            (user) => {
                this.userData.next(user);
            },
            (error) => {
                this.toastService.addToast(
                    "Authentication Error",
                    error.message,
                    "error"
                );
            }
        );

        this.angularFireAuth.idTokenResult.subscribe((idTokenResult) => {
            if (idTokenResult) {
                this.customClaims.next({
                    admin: idTokenResult.claims["admin"],
                });
            }
        });

        this.userData.subscribe(async (user) => {
            this.sentrySetUser(user);

            if (user) {
                const uid = user.uid;
                const itemDoc = this.firestore
                    .collection("users")
                    .doc<UserAuthData | undefined>(uid);

                this.userAuthDataSubscription = itemDoc
                    .valueChanges()
                    .subscribe((value) => {
                        this.userAuth.next(value);

                        if (!isUserAllowed(value, this.router.url)) {
                            this.router.navigate([""]);
                        }
                    });
            } else if (user === null) {
                this.userAuth.next(undefined);

                if (this.userAuthDataSubscription) {
                    this.userAuthDataSubscription.unsubscribe();
                }

                if (!isUserAllowed(undefined, this.router.url)) {
                    this.router.navigate([""]);
                }
            }
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

                this.toastService.addToast(
                    "Login Successful",
                    toastMessage,
                    "success"
                );

                console.log(res);
            })
            .catch((reason) => {
                console.log("Login failed: ", reason);

                if ("auth/user-disabled" === reason.code) {
                    this.toastService.addToast(
                        "Account Banned",
                        "Your account has been banned by an administrator. If you think this is an error, please contact us at 'tungnan5636@gmail.com'.",
                        "error", {
                            nzDuration: 0,
                        }
                    );
                } else {
                    this.toastService.addToast(
                        "Login Error",
                        reason.message,
                        "error"
                    );
                }
            });
    }

    logout() {
        this.angularFireAuth
            .signOut()
            .then(() => {
                this.userData.next(null);
                this.toastService.addToast(
                    "Logout Successful",
                    "Hope to see you again soon!",
                    "success"
                );
            })
            .catch((reason) => {
                console.log("Logout failed: ", reason);
                this.toastService.addToast(
                    "Logout Error",
                    reason.message,
                    "error"
                );
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

    getIdToken(): Promise<string> | undefined {
        return this.userData.getValue()?.getIdToken();
    }

    isAdmin(): boolean {
        return Boolean(this.customClaims.value?.admin);
    }
}
