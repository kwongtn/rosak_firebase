import {
    Theme,
    ThemeService,
    ThemeServiceFollowSystemOff,
    ThemeServiceFollowSystemOn,
} from "ng-devui/theme";
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
    themePrefersColorScheme!: boolean;
    sub: Subscription | undefined;
    advancedThemeList = [
        { value: "infinity", url: themePickerImg.infinity },
        { value: "galaxy", url: themePickerImg.galaxy },
    ];
    themeProps: ThemeProperties = {
        infinity: {
            name: "Infinity | 无限",
        },
        galaxy: {
            name: "Galaxy | 追光",
        },
    };
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

        this.themePrefersColorScheme =
            localStorage.getItem("devuiThemePrefersColorScheme") === "on";
        if (this.themePrefersColorScheme) {
            this.themePrefersColorSchemeChange(true);
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

    themeChange(theme: string) {
        this.currentTheme = theme;
        this.themeService.applyTheme(this.themes[theme]);
    }

    themePrefersColorSchemeChange(event: boolean) {
        if (event) {
            if (this.sub) {
                ThemeServiceFollowSystemOff(this.sub);
            }
            this.sub = ThemeServiceFollowSystemOn({
                lightThemeName: "infinity-theme",
                darkThemeName: "galaxy-theme",
            });
            this.setThemePrefersColorScheme("on");
        } else {
            ThemeServiceFollowSystemOff(this.sub);
            this.setThemePrefersColorScheme("off");
            this.sub = undefined;
        }
    }

    ngOnDestroy(): void {
        if (this.themePrefersColorScheme) {
            ThemeServiceFollowSystemOff(this.sub);
        }
        this.subs.unsubscribe();
    }

    setThemePrefersColorScheme(value: "on" | "off") {
        localStorage.setItem("devuiThemePrefersColorScheme", value);
    }
}
