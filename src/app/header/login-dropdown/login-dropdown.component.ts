import { AuthService } from "src/app/services/auth/auth.service";

import { Component, Input, OnInit } from "@angular/core";

@Component({
    selector: "app-login-dropdown",
    templateUrl: "./login-dropdown.component.html",
    styleUrls: ["./login-dropdown.component.scss"],
})
export class LoginDropdownComponent implements OnInit {
    @Input() userAvatar: any;

    profileHref: string = "/profile";

    constructor(public authService: AuthService) {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
