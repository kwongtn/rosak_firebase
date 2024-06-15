import { Subscription } from "rxjs";
import { AuthService } from "src/app/services/auth.service";
import { ThemeService } from "src/app/services/theme/theme.service";

import { Component, Input, OnDestroy, OnInit } from "@angular/core";

@Component({
    selector: "app-login-dropdown",
    templateUrl: "./login-dropdown.component.html",
    styleUrls: ["./login-dropdown.component.scss"],
})
export class LoginDropdownComponent implements OnInit, OnDestroy {
    @Input() userAvatar: any;
    themeFollowSystemColorScheme =
        this.themeService.themeFollowSystemColorScheme.value;

    profileHref: string = "/profile";

    themeSubscription!: Subscription;

    constructor(
        public authService: AuthService,
        private themeService: ThemeService
    ) {
        return;
    }

    ngOnInit(): void {
        this.themeSubscription =
            this.themeService.themeFollowSystemColorScheme.subscribe(
                (value) => {
                    this.themeFollowSystemColorScheme = value;
                }
            );
    }

    ngOnDestroy(): void {
        this.themeSubscription?.unsubscribe();
    }

    followSystemColorScheme(toggleValue: boolean) {
        this.themeService.followSystemColorScheme(toggleValue);
    }
}
