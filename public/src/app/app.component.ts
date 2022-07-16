import { Component } from "@angular/core";

@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"],
})
export class AppComponent {
    title = "public";
    innerMenuList = [
        {
            name: "设计规范",
            enName: "DevUI Design",
            href: "/design-cn/start",
        },
        {
            name: "组件",
            enName: "Components",
            href: "/components/overview",
            target: "_self",
        },
        {
            name: "版本历程",
            enName: "Changelog",
            href: "https://github.com/DevCloudFE/ng-devui/releases",
        },
    ];

    constructor() {
        return;
    }
}
