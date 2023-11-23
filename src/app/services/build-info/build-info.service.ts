import { BehaviorSubject } from "rxjs";
import { environment } from "src/environments/environment";

import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

import build from "../../../build";

export interface BackendBuildInfo {
    hash: string;
    datetime: string;
}

@Injectable({
    providedIn: "root",
})
export class BuildInfoService {
    buildInfo = build;
    backendBuildInfo: BehaviorSubject<BackendBuildInfo> =
        new BehaviorSubject<BackendBuildInfo>({
            hash: "...",
            datetime: "...",
        });

    constructor(private httpClient: HttpClient) {
        console.log(
            [
                "\n%cBuild Info:\n",
                `%c > Environment: %c${
                    environment.production
                        ? "production 🏭"
                        : environment.sentry.environment === "staging"
                            ? "staging 🚈"
                            : "development 🚧"
                }`,
                `%c > Build Version: ${build.version}`,
                ` > Build Timestamp: ${build.timestamp}`,
                ` > Built by: ${build.git.user}`,
                ` > Commit: ${build.git.hash} @ ${build.git.branch}`,
                ` > Build Message: %c${build.message || "<no message>"}`,
            ].join("\n"),
            "font-size: 14px; color: #7c7c7b;",
            "font-size: 12px; color: #7c7c7b",
            environment.production
                ? "font-size: 12px; color: #95c230;"
                : "font-size: 12px; color: #e26565;",
            "font-size: 12px; color: #7c7c7b",
            "font-size: 12px; color: #bdc6cf"
        );

        this.httpClient
            .get<BackendBuildInfo>(environment.backendUrl + "version/")
            .subscribe((data) => {
                this.backendBuildInfo.next(data);
                console.log(this.backendBuildInfo);
            });
    }

    getBuildInfo(): typeof build {
        return this.buildInfo;
    }
}
