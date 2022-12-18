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
    theme: string = "devui-light-theme";
    fontSize: "normal" | "large" = "normal";
    themeMode: "light" | "dark" = "light";
    themePrefix: "devui" | "green" | string = "devui";
    themePrefersColorScheme!: boolean;
    sub: Subscription | undefined;
    activeThemeType: string | number = "devuiTheme";
    advancedThemeList = [
        { value: "infinity", url: themePickerImg.infinity },
        { value: "sweet", url: themePickerImg.sweet },
        { value: "provence", url: themePickerImg.provence },
        { value: "deep", url: themePickerImg.deep },
        { value: "galaxy", url: themePickerImg.galaxy },
    ];
    themeProps: ThemeProperties = {
        infinity: {
            name: "Infinity | 无限",
        },
        sweet: {
            name: "Sweet | 蜜糖",
        },
        deep: {
            name: "Deep | 深邃夜空",
        },
        provence: {
            name: "Provence | 普罗旺斯",
        },
        galaxy: {
            name: "Galaxy | 追光",
        },
    };
    currentAdvancedTheme = "infinity";
    subs: Subscription = new Subscription();
    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit() {
        if (typeof window !== "undefined") {
            this.themeService = (window as { [key: string]: any })[
                "devuiThemeService"
            ] as ThemeService;
            this.themes = (window as { [key: string]: any })["devuiThemes"];
            this.theme = (window as { [key: string]: any })[
                "devuiCurrentTheme"
            ];
        }
        const themeName = localStorage
            .getItem("user-custom-theme")
            ?.split("-")[0];
        this.currentAdvancedTheme = this.advancedThemeList.find(
            (theme) => theme.value === themeName
        )
            ? (themeName as string)
            : "infinity";
        this.advancedThemeChange(this.currentAdvancedTheme);
        this.themePrefix = this.getThemePrefix();
        this.themeMode = this.themes[this.theme]?.isDark ? "dark" : "light";
        this.themePrefersColorScheme = this.getThemePrefersColorSchemeOn();
        this.initTheme();
        this.cdr.detectChanges();
        if (this.themePrefersColorScheme) {
            this.themePrefersColorSchemeChange(true);
        }
    }

    getThemePrefix() {
        return this.theme.split("-")[0] !== "devui" &&
            this.theme.split("-")[0] !== "green"
            ? "devui"
            : this.theme.split("-")[0];
    }
    initTheme() {
        if (!this.checkInitThemeType()) {
            this.activeThemeType = "devuiTheme";
            this.themesChange();
        } else {
            this.activeThemeType = "advancedTheme";
            const themeName = localStorage
                .getItem("user-custom-theme")
                ?.split("-")[0];
            this.currentAdvancedTheme = this.advancedThemeList.find(
                (theme) => theme.value === themeName
            )
                ? (themeName as string)
                : "infinity";
            this.advancedThemeChange(this.currentAdvancedTheme);
        }
    }

    checkInitThemeType() {
        const advancedThemePrefixList = [
            "infinity",
            "sweet",
            "provence",
            "deep",
            "galaxy",
        ];
        return advancedThemePrefixList.some((item) => {
            const themeString = localStorage.getItem("user-custom-theme");

            if (themeString) {
                return themeString.startsWith(item);
            }

            return false;
        });
    }

    themePrefixChange(prefix: string) {
        this.themePrefix = prefix;
        if (this.themePrefersColorScheme) {
            this.themePrefersColorSchemeChange(true);
        } else {
            this.themesChange();
        }
    }

    themesChange() {
        this.theme = `${this.themePrefix}-${this.themeMode}-theme`;

        this.themeService.applyTheme(this.themes[this.theme]);
    }

    advancedThemeChange(theme: string) {
        this.currentAdvancedTheme = theme;
        const validTheme = theme + "-theme";
        this.themeService.applyTheme(this.themes[validTheme]);
    }

    themePrefersColorSchemeChange(event: boolean) {
        if (event) {
            if (this.sub) {
                ThemeServiceFollowSystemOff(this.sub);
            }
            this.sub = ThemeServiceFollowSystemOn({
                lightThemeName: `${this.themePrefix}-light-theme`,
                darkThemeName: `${this.themePrefix}-dark-theme`,
            });
            this.setThemePrefersColorScheme("on");
        } else {
            ThemeServiceFollowSystemOff(this.sub);
            this.setThemePrefersColorScheme("off");
            this.sub = undefined;
            this.themesChange();
        }
    }

    ngOnDestroy(): void {
        if (this.themePrefersColorScheme) {
            ThemeServiceFollowSystemOff(this.sub);
        }
        this.subs.unsubscribe();
    }

    getThemeFontSizeSchemeOn() {
        return localStorage.getItem("devuiThemeFontSizeScheme") === "on";
    }

    setThemeFontSizeScheme(value: "on" | "off") {
        localStorage.setItem("devuiThemeFontSizeScheme", value);
    }

    getThemePrefersColorSchemeOn() {
        return localStorage.getItem("devuiThemePrefersColorScheme") === "on";
    }

    setThemePrefersColorScheme(value: "on" | "off") {
        localStorage.setItem("devuiThemePrefersColorScheme", value);
    }

    activeTabChange(tab: string | number) {
        if (tab === "advancedTheme") {
            this.advancedThemeChange(this.currentAdvancedTheme);
        } else {
            this.themesChange();
        }
    }
}
