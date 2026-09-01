import { DatePipe } from "@angular/common";
import { httpResource } from "@angular/common/http";
import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { buildInfo } from "../../../build-info";
import { environment } from "../../../environments/environment";
import { NewVersionService } from "../../core/version/new-version.service";
import {
  BACKEND_REPO_URL,
  FRONTEND_REPO_URL,
  backendCommitUrl,
  frontendCommitUrl,
  isValidHash,
  toShortHash,
} from "./app-footer.util";

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
 *
 * Hash display vs link: stores the full 40-char commit hash but renders only the first 7 chars
 * (familiar short-hash UX) — the anchor's href always uses the full hash to avoid collision.
 * Words "Frontend"/"Backend" link to their respective GitHub repos. A subtle amber dot appears
 * to the right of the frontend line when NewVersionService detects a newer /version.json
 * deployment (backend in-progress dot is KIV).
 */
@Component({
  selector: "app-footer",
  imports: [DatePipe, RouterLink],
  template: `
    <footer class="text-muted-foreground border-border border-t py-4 text-center text-xs">
      <p class="flex flex-col items-center gap-0.5">
        <span class="inline-flex items-center gap-1.5">
          <a
            [href]="frontendRepoUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-foreground underline"
            >Frontend</a
          >
          build
          @if (isValidHash(buildInfo.hash)) {
            <a
              [href]="frontendCommitUrl()"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-foreground font-mono underline decoration-dotted"
              [attr.title]="buildInfo.hash"
              >{{ frontendShortHash() }}</a
            >
          } @else {
            <span class="font-mono">{{ buildInfo.hash }}</span>
          }
          &#64; {{ buildInfo.timestamp | date: "medium" }}
          @if (hasNewVersion()) {
            <span
              class="bg-amber-500 inline-block size-1.5 rounded-full animate-pulse motion-reduce:animate-none"
              title="New version available — reload to update"
              aria-label="New version available"
            ></span>
          }
        </span>
        @if (backendVersion.value(); as backend) {
          <span class="inline-flex items-center gap-1.5">
            <a
              [href]="backendRepoUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-foreground underline"
              >Backend</a
            >
            build
            @if (isValidHash(backend.hash)) {
              <a
                [href]="backendCommitUrl(backend.hash)"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-foreground font-mono underline decoration-dotted"
                [attr.title]="backend.hash"
                >{{ backendShortHash(backend.hash) }}</a
              >
            } @else {
              <span class="font-mono">{{ backend.hash }}</span>
            }
            &#64; {{ backend.datetime | date: "medium" }}
          </span>
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
        &amp; contributors &middot;
        <a routerLink="/gdpr" class="hover:text-foreground underline">GDPR</a> (beta)
      </p>
    </footer>
  `,
})
export class AppFooterComponent {
  protected readonly buildInfo = buildInfo;
  protected readonly backendVersion = httpResource<BackendVersion>(
    () => `${environment.backendUrl}version/`,
  );

  private readonly newVersion = inject(NewVersionService);
  protected readonly hasNewVersion = this.newVersion.hasNewVersion;

  protected readonly frontendRepoUrl = FRONTEND_REPO_URL;
  protected readonly backendRepoUrl = BACKEND_REPO_URL;

  protected readonly frontendShortHash = computed(() => toShortHash(this.buildInfo.hash));
  protected readonly frontendCommitUrl = computed(() => frontendCommitUrl(this.buildInfo.hash));

  protected isValidHash = isValidHash;
  protected toShortHash = toShortHash;
  protected backendShortHash = toShortHash;
  protected backendCommitUrl = backendCommitUrl;
}
