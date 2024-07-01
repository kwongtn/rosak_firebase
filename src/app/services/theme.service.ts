import { Theme, ThemeService as NgThemeService } from "ng-devui/theme";
import { BehaviorSubject, Subscription } from "rxjs";

import { afterNextRender, Injectable } from "@angular/core";

@Injectable({
    providedIn: "root",
})
export class ThemeService {
    themeService!: NgThemeService;
    themes: { [key: string]: Theme } = {};
    themeFollowSystemColorScheme!: BehaviorSubject<boolean>;
    colorScheme!: BehaviorSubject<"light" | "dark">;

    sub: Subscription | undefined;
    advancedThemeList = ["infinity", "galaxy"];
    currentTheme = "infinity";

    constructor() {
        afterNextRender(() => {
            if (typeof window !== "undefined") {
                this.themeService = (window as { [key: string]: any })[
                    "devuiThemeService"
                ] as NgThemeService;
                this.themes = (window as { [key: string]: any })["devuiThemes"];
            }

            if (typeof localStorage !== "undefined") {
                this.themeFollowSystemColorScheme =
                    new BehaviorSubject<boolean>(
                        localStorage.getItem(
                            "devuiThemeFollowSystemColorScheme"
                        ) === "on"
                    );

                if (this.themeFollowSystemColorScheme.value) {
                    this.followSystemColorScheme(true);
                } else {
                    this.initTheme();
                }
            }
        });
    }

    initTheme() {
        const themeName =
            localStorage.getItem("user-custom-theme")?.split("-")[0] ??
            "infinity";

        this.currentTheme = this.advancedThemeList.includes(themeName)
            ? (themeName as string)
            : "infinity";

        this.themeChange(this.currentTheme);
    }

    toggleTheme() {
        this.followSystemColorScheme(false);
        this.themeFollowSystemColorScheme.next(false);

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
        if (this.colorScheme) {
            this.colorScheme.next(theme === "infinity" ? "light" : "dark");
        } else {
            this.colorScheme = new BehaviorSubject<"light" | "dark">(
                theme === "infinity" ? "light" : "dark"
            );
        }
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

        this.themeFollowSystemColorScheme.next(toggleValue);
    }

    ngOnDestroy(): void {
        if (this.themeFollowSystemColorScheme) {
            this.ThemeServiceFollowSystemOff(this.sub);
        }
    }

    setThemeFollowSystemColorScheme(value: "on" | "off") {
        localStorage.setItem("devuiThemeFollowSystemColorScheme", value);
    }
}
