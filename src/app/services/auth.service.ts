import { BehaviorSubject, Observable, Subscription } from "rxjs";

import { Injectable } from "@angular/core";
import {
    Auth,
    authState,
    GoogleAuthProvider,
    ParsedToken,
    signInWithPopup,
    signOut,
    Unsubscribe,
    User,
} from "@angular/fire/auth";
import { doc, Firestore, onSnapshot } from "@angular/fire/firestore";
import { Router } from "@angular/router";
import * as Sentry from "@sentry/browser";

import { isUserAllowed } from "./auth-permissions";
import { ToastService } from "./toast.service";

export interface UserAuthData {
    permissions?: {
        admin?: boolean;
    };
}

export interface CustomClaims {
    admin?: boolean;
    betaTester?: boolean;
}

@Injectable({
    providedIn: "root",
})
export class AuthService {
    authState$ = authState(this.auth);
    authStateSubscription: Subscription;

    userData: BehaviorSubject<User | null | undefined> = new BehaviorSubject<
        User | null | undefined
    >(undefined);

    customClaims: BehaviorSubject<ParsedToken | undefined> =
        new BehaviorSubject<ParsedToken | undefined>(undefined);

    userAuth: BehaviorSubject<UserAuthData | null | undefined> =
        new BehaviorSubject<UserAuthData | null | undefined>(null);
    public readonly userAuth$: Observable<UserAuthData | undefined | null> =
        this.userAuth.asObservable();

    loginViaLoginFunction: boolean = false;
    unsubscribe: Unsubscribe | undefined = undefined;

    constructor(
        private toastService: ToastService,
        private router: Router,
        private auth: Auth,
        private firestore: Firestore
    ) {
        this.authStateSubscription = this.authState$.subscribe(
            (user: User | null) => {
                if (user) {
                    this.userData.next(user);
                    user.getIdTokenResult().then((token) => {
                        this.customClaims.next(token.claims);
                    });
                }
            }
        );

        this.userData.subscribe(async (user) => {
            this.sentrySetUser(user);

            if (user) {
                this.unsubscribe = onSnapshot(
                    doc(this.firestore, "users", user.uid),
                    (doc) => {
                        const exists = doc.exists();
                        if (exists) {
                            const data = doc.data();
                            this.userAuth.next(data);

                            if (!isUserAllowed(data, this.router.url)) {
                                this.router.navigate([""]);
                            }
                        }
                    }
                );
            } else if (user === null) {
                this.userAuth.next(undefined);

                if (this.unsubscribe) {
                    this.unsubscribe();
                }

                if (!isUserAllowed(undefined, this.router.url)) {
                    this.router.navigate([""]);
                }
            }
        });
    }

    login() {
        signInWithPopup(this.auth, new GoogleAuthProvider())
            .then((res) => {
                let toastMessage: string;
                if (res.user.metadata.lastSignInTime) {
                    toastMessage = `Welcome back, ${
                        res.user.displayName ?? res.user.email
                    }`;
                } else {
                    toastMessage = "Welcome!";
                }

                this.toastService.addToast(
                    "Login Successful",
                    toastMessage,
                    "success",
                    {
                        nzPlacement: "top",
                    }
                );

                console.log(res);
                this.userData.next(res.user);
            })
            .catch((reason) => {
                console.log("Login failed: ", reason);

                if ("auth/user-disabled" === reason.code) {
                    this.toastService.addToast(
                        "Account Banned",
                        "Your account has been banned by an administrator. If you think this is an error, please contact us at 'tungnan5636@gmail.com'.",
                        "error",
                        {
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
        signOut(this.auth)
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

    sentrySetUser(user: User | null | undefined) {
        if (user) {
            Sentry.setUser({
                email: user.email?.toString(),
                id: user.uid,
                ip_address: "{{auto}}",
            });
        } else {
            Sentry.setUser(null);
        }
    }

    getIdToken(): Promise<string> | undefined {
        return this.userData.getValue()?.getIdToken();
    }

    isLoggedIn(): boolean {
        return Boolean(this.userData.value);
    }

    isAdmin(): boolean {
        return Boolean(this.customClaims.value?.["admin"]);
    }
}
