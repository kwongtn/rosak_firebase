import { BehaviorSubject } from "rxjs";

import { Injectable } from "@angular/core";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

@Injectable({
    providedIn: "root",
})
export class ThemeService {
    themeFollowSystemColorScheme: BehaviorSubject<boolean>;
    colorScheme!: BehaviorSubject<"light" | "dark">;

    mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
    mediaQueryListener = (event: MediaQueryListEvent) => {
        this.themeChange(event.matches ? "galaxy" : "infinity");
    };

    advancedThemeList = ["infinity", "galaxy"];
    currentTheme = "infinity";

    constructor() {
        this.themeFollowSystemColorScheme = new BehaviorSubject<boolean>(
            localStorage.getItem("devuiThemeFollowSystemColorScheme") === "on"
        );

        if (this.themeFollowSystemColorScheme.value) {
            this.followSystemColorScheme(true);
        } else {
            this.initTheme();
        }
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
        localStorage.setItem("user-custom-theme", theme);
        document.documentElement.setAttribute(
            "data-theme",
            theme === "infinity" ? "light" : "dark"
        );

        if (this.colorScheme) {
            this.colorScheme.next(theme === "infinity" ? "light" : "dark");
        } else {
            this.colorScheme = new BehaviorSubject<"light" | "dark">(
                theme === "infinity" ? "light" : "dark"
            );
        }
    }

    followSystemColorScheme(toggleValue: boolean) {
        this.mediaQuery.removeEventListener("change", this.mediaQueryListener);

        if (toggleValue) {
            this.mediaQuery.addEventListener("change", this.mediaQueryListener);
            this.themeChange(this.mediaQuery.matches ? "galaxy" : "infinity");

            this.setThemeFollowSystemColorScheme("on");
        } else {
            this.setThemeFollowSystemColorScheme("off");
        }

        this.themeFollowSystemColorScheme.next(toggleValue);
    }

    ngOnDestroy(): void {
        this.mediaQuery.removeEventListener("change", this.mediaQueryListener);
    }

    setThemeFollowSystemColorScheme(value: "on" | "off") {
        localStorage.setItem("devuiThemeFollowSystemColorScheme", value);
    }
}
