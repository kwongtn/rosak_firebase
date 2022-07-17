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

    constructor(
        private angularFireAuth: AngularFireAuth,
        private toastService: ToastService
    ) {
        return;
    }

    login() {
        this.angularFireAuth
            .signInWithPopup(new firebase.auth.GoogleAuthProvider())
            .then((res) => {
                this.userData.next(res.user);

                let toastMessage: string;
                if (
                    res.additionalUserInfo &&
                    res.additionalUserInfo.isNewUser
                ) {
                    toastMessage = "Welcome!";
                } else {
                    toastMessage = "Welcome back.";
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
