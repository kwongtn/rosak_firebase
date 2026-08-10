import { HttpClient } from "@angular/common/http";
import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject, signal } from "@angular/core";
import { PromisePool } from "@supercharge/promise-pool";
import { firstValueFrom } from "rxjs";

import { environment } from "../../../environments/environment";
import { AuthService } from "../auth/auth.service";
import { ImageFile } from "./image-file";
import { deletePendingUpload, loadAllPendingUploads, savePendingUpload } from "./upload-queue-db";

export type PendingUploadType = "SPOTTING_EVENT" | "INCIDENT_CALENDAR_INCIDENT";

interface PendingUpload {
    /** IndexedDB key for this item, once persisted — see upload-queue-db.ts. Undefined only in
     * the brief window between pushing to `pendingUploads` and the save's own promise resolving;
     * never re-derived, so a failed/unsupported save just leaves it undefined forever, which
     * `triggerUpload` already treats as "nothing to delete on success," not an error. */
    dbId?: number;
    type: PendingUploadType;
    relatedId: number | string;
    file: ImageFile;
}

/**
 * App-wide photo upload queue, ported from src/app/services/image-upload.service.ts.
 * Same REST contract (`POST {backendUrl}upload/`, multipart `related_id`/`upload_type`/
 * `image`, `Firebase-Auth-Key` header), same unbounded-retry-on-error behavior, same
 * PromisePool-bounded concurrency. Rewritten on signals instead of RxJS BehaviorSubjects;
 * exposes counts only — callers (e.g. the spotting shell) decide how to surface progress/
 * completion in the UI, keeping this core service UI-library-agnostic.
 *
 * Improved over both the old app and this file's own first pass: every queued item is also
 * persisted to IndexedDB (see upload-queue-db.ts) and reloaded on the next app start, so an
 * accidental tab close, a refresh, or a browser crash mid-upload no longer silently loses
 * whatever hadn't finished yet — it resumes instead. That's a real, meaningful improvement, but
 * it is *not* "uploads keep running while the tab/browser is closed": nothing in a standard web
 * app (no Service Worker, no native wrapper) can make a network request keep executing with
 * nothing hosting it. The closest a browser gets to that — a Service Worker registered for
 * Background Sync — only works while the browser process itself is still running somewhere
 * (quitting it stops everything regardless), is Chromium-only (Firefox/Safari have never shipped
 * it), and is best-effort even there (the OS can delay or drop the retry under battery/memory
 * pressure). That's real, separate infrastructure — deliberately not what this does.
 *
 * Every item is only ever persisted/resumed once it's actually ready to upload (`!toCompress`, or
 * `toCompress && isCompressed`) — the compression step itself is not resumable (there's nothing to
 * resume mid-compression from), and callers already guarantee they never call `addToQueue` before
 * compression finishes (see PhotoPickerComponent.isCompressing's doc comment) — so that state
 * should never actually arise here, but "assume it can't happen" is exactly the assumption that
 * caused the compression race condition this app already had to fix once.
 */
@Injectable({ providedIn: "root" })
export class ImageUploadService {
    private readonly http = inject(HttpClient);
    private readonly auth = inject(AuthService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    private pendingUploads: PendingUpload[] = [];
    private uploadInterval: ReturnType<typeof setInterval> | undefined;
    private isUploading = false;

    readonly pendingCount = signal(0);
    readonly totalCount = signal(0);
    readonly percentUploaded = signal(0);

    constructor() {
        if (!this.isBrowser) {
            return;
        }
        loadAllPendingUploads()
            .then((saved) => {
                if (saved.length === 0) {
                    return;
                }
                this.pendingUploads.push(
                    ...saved.map((s) => ({
                        dbId: s.id,
                        type: s.type,
                        relatedId: s.relatedId,
                        file: { file: s.file, toCompress: false, isCompressed: true } satisfies ImageFile,
                    }))
                );
                this.totalCount.update((n) => n + saved.length);
                this.refreshCounts();
                this.startInterval();
            })
            .catch(() => {
                // IndexedDB unavailable (private browsing, quota, unsupported) — nothing to
                // resume; new uploads still queue and persist normally going forward.
            });
    }

    addToQueue(relatedId: number | string, file: ImageFile, type: PendingUploadType): void {
        const entry: PendingUpload = { relatedId, file, type };
        this.pendingUploads.push(entry);
        this.totalCount.update((n) => n + 1);
        this.refreshCounts();

        if (this.isBrowser) {
            savePendingUpload({ relatedId, type, file: file.file })
                .then((dbId) => (entry.dbId = dbId))
                .catch(() => {
                    // Not persisted, but still queued in memory — same as before this feature existed.
                });
        }

        this.startInterval();
    }

    private startInterval(): void {
        if (!this.uploadInterval) {
            this.uploadInterval = setInterval(() => {
                if (this.pendingUploads.length > 0 && !this.isUploading) {
                    this.triggerUpload();
                }
            }, 1000);
        }
    }

    private async triggerUpload(): Promise<void> {
        const batch = this.pendingUploads;
        this.pendingUploads = [];
        this.isUploading = true;

        await PromisePool.withConcurrency(environment.upload.concurrency)
            .for(batch)
            .process(async (item) => {
                const { type, relatedId, file, dbId } = item;
                if (file.toCompress && !file.isCompressed) {
                    this.pendingUploads.push(item);
                    return;
                }

                const body = new FormData();
                body.append("related_id", relatedId.toString());
                body.append("upload_type", type);
                body.append("image", file.file);

                const idToken = await this.auth.idToken();
                try {
                    await firstValueFrom(
                        this.http.post(`${environment.backendUrl}upload/`, body, {
                            headers: idToken ? { "Firebase-Auth-Key": idToken } : {},
                        })
                    );
                    this.pendingCount.update((n) => n - 1);
                    this.recomputePercent();
                    if (dbId !== undefined) {
                        deletePendingUpload(dbId).catch(() => {});
                    }
                } catch (err) {
                    // No retry limit/backoff — matches current production behavior.
                    this.pendingUploads.push(item);
                    throw err;
                }
            });

        this.isUploading = false;
        this.refreshCounts();

        if (this.pendingUploads.length === 0 && this.uploadInterval) {
            clearInterval(this.uploadInterval);
            this.uploadInterval = undefined;
        }
    }

    private refreshCounts(): void {
        this.pendingCount.set(this.pendingUploads.length);
        this.recomputePercent();
    }

    private recomputePercent(): void {
        const total = this.totalCount();
        this.percentUploaded.set(total === 0 ? 0 : ((total - this.pendingCount()) * 100) / total);
    }
}
