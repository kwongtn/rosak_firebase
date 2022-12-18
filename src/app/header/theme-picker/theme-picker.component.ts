import { Theme, ThemeService } from "ng-devui/theme";
import { Subscription } from "rxjs";

import { ChangeDetectorRef, Component, OnDestroy, OnInit } from "@angular/core";

import { themePickerImg } from "./theme-picker-img";

interface ThemeProperties {
    [key: string]: {
        name: string;
    };
}

@Component({
    selector: "app-theme-picker",
    templateUrl: "./theme-picker.component.html",
    styleUrls: ["./theme-picker.component.scss"],
})
export class ThemePickerComponent implements OnInit, OnDestroy {
    themeService!: ThemeService;
    themes: { [key: string]: Theme } = {};
    themeFollowSystemColorScheme!: boolean;
    sub: Subscription | undefined;
    advancedThemeList = [
        { value: "infinity", url: themePickerImg.infinity },
        { value: "galaxy", url: themePickerImg.galaxy },
    ];
    currentTheme = "infinity";
    subs: Subscription = new Subscription();
    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit() {
        if (window) {
            this.themeService = (window as { [key: string]: any })[
                "devuiThemeService"
            ] as ThemeService;
            this.themes = (window as { [key: string]: any })["devuiThemes"];
        }

        this.themeFollowSystemColorScheme =
            localStorage.getItem("devuiThemeFollowSystemColorScheme") === "on";

        if (this.themeFollowSystemColorScheme) {
            this.followSystemColorScheme(true);
        } else {
            this.initTheme();
        }
        this.cdr.detectChanges();
    }

    initTheme() {
        const themeName = localStorage
            .getItem("user-custom-theme")
            ?.split("-")[0];
        this.currentTheme = this.advancedThemeList.find(
            (theme) => theme.value === themeName
        )
            ? (themeName as string)
            : "infinity";
        this.themeChange(this.currentTheme);
    }

    onIconClick() {
        this.followSystemColorScheme(false);
        this.themeFollowSystemColorScheme = false;

        if (this.currentTheme === "infinity") {
            this.currentTheme = "galaxy";
            this.themeChange(this.currentTheme);
        } else {
            this.currentTheme = "infinity";
            this.themeChange(this.currentTheme);
        }
    }

    themeChange(theme: string) {
        this.currentTheme = theme;
        this.themeService.applyTheme(this.themes[theme]);
    }

    ThemeServiceFollowSystemOn(): Subscription {
        this.themeService.registerMediaQuery();
        return this.themeService.mediaQuery.prefersColorSchemeChange.subscribe(
            (value) => {
                if (value === "dark") {
                    this.themeChange("galaxy");
                } else {
                    this.themeChange("infinity");
                }
            }
        );
    }
    
    ThemeServiceFollowSystemOff(sub?: Subscription) {
        if (sub) {
            sub.unsubscribe();
        }
        this.themeService.unregisterMediaQuery();
    }

    followSystemColorScheme(toggleValue: boolean) {
        if (toggleValue) {
            if (this.sub) {
                this.ThemeServiceFollowSystemOff(this.sub);
            }
            this.sub = this.ThemeServiceFollowSystemOn();

            this.setThemeFollowSystemColorScheme("on");
        } else {
            this.ThemeServiceFollowSystemOff(this.sub);
            this.sub = undefined;

            this.setThemeFollowSystemColorScheme("off");
        }
    }

    ngOnDestroy(): void {
        if (this.themeFollowSystemColorScheme) {
            this.ThemeServiceFollowSystemOff(this.sub);
        }
        this.subs?.unsubscribe();
    }

    setThemeFollowSystemColorScheme(value: "on" | "off") {
        localStorage.setItem("devuiThemeFollowSystemColorScheme", value);
    }
}
