import firebase from "firebase/compat/app";
import { BehaviorSubject } from "rxjs";

import { Injectable } from "@angular/core";
import { AngularFireAuth } from "@angular/fire/compat/auth";

import { ToastService } from "../toast/toast.service";

@Injectable({
    providedIn: "root",
})
export class AuthService {
    userData: BehaviorSubject<firebase.User | null> =
        new BehaviorSubject<firebase.User | null>(null);

    loginViaLoginFunction: boolean = false;

    constructor(
        private angularFireAuth: AngularFireAuth,
        private toastService: ToastService
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
}
