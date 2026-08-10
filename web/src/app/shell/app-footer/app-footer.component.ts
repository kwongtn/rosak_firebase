import { DatePipe } from "@angular/common";
import { httpResource } from "@angular/common/http";
import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { buildInfo } from "../../../build-info";
import { environment } from "../../../environments/environment";

interface BackendVersion {
    hash: string;
    datetime: string | null;
}

/**
 * "Build data" footer — frontend commit + build time (baked in at build time by
 * scripts/generate-build-info.mjs) plus the backend's own version, fetched from the same
 * `{backendUrl}version/` endpoint the old app's BuildInfoService used. Meant to sit as the last
 * child of a `flex min-h-screen flex-col` page shell so it's pinned to the bottom of the
 * viewport on short pages and pushed down naturally on long ones — no negative-margin hacks.
 */
@Component({
    selector: "app-footer",
    imports: [DatePipe, RouterLink],
    template: `
        <footer class="text-muted-foreground border-border border-t py-4 text-center text-xs">
            <p>
                Frontend build <span class="font-mono">{{ buildInfo.hash }}</span> &#64;
                {{ buildInfo.timestamp | date: "medium" }}
                @if (backendVersion.value(); as backend) {
                    <br />
                    Backend build <span class="font-mono">{{ backend.hash }}</span> &#64;
                    {{ backend.datetime | date: "medium" }}
                }
            </p>
            <p class="mt-1">
                GNU AGPLv3 by
                <a
                    href="https://github.com/kwongtn"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="hover:text-foreground underline"
                >
                    KwongTN
                </a>
                &amp; contributors
                &middot;
                <a routerLink="/gdpr" class="hover:text-foreground underline">GDPR</a> (beta)
            </p>
        </footer>
    `,
})
export class AppFooterComponent {
    protected readonly buildInfo = buildInfo;
    protected readonly backendVersion = httpResource<BackendVersion>(() => `${environment.backendUrl}version/`);
}
