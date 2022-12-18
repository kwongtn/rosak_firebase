import firebase from "firebase/compat/app";

import { Component, Input, OnInit } from "@angular/core";

import { UserDataResponseUser } from "../services/get-user-data.service";

@Component({
    selector: "profile-user",
    templateUrl: "./user.component.html",
    styleUrls: ["./user.component.scss"],
})
export class ProfileUserComponent implements OnInit {
    @Input() displayData: UserDataResponseUser | undefined = undefined;
    @Input() user!: firebase.User;
    @Input() loading = true;

    constructor() {
        return;
    }

    ngOnInit() {
        return;
    }
}
