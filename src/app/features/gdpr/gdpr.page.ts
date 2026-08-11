import { isPlatformBrowser } from "@angular/common";
import { Component, OnDestroy, PLATFORM_ID, computed, inject, signal } from "@angular/core";
import { getApps, initializeApp } from "firebase/app";
import { Unsubscribe, doc as firestoreDoc, getFirestore, onSnapshot } from "firebase/firestore";
import { environment } from "../../../environments/environment";
import { HlmBadge } from "../../ui/badge/badge";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { PublicGdprDocument } from "./data/gdpr.model";

function firebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}

/**
 * /gdpr — ported from compliance/gdpr.component.ts: content is entirely Firestore-driven
 * (`public/gdpr`, admin-edited), same client-rendered pattern as /about's `public/about` doc —
 * there's no SSR benefit to a doc that only ever changes by hand, not by request.
 *
 * The old app's per-item collapse state (`isCollapsed`, toggled through ng-zorro's
 * `nz-collapse-panel`) isn't ported: a native `<details>` already tracks its own open/closed
 * state without any component-side bookkeeping, so there's nothing here to replicate — this
 * matches the plain `<details>`/`<summary>` accordion pattern already used elsewhere in this app
 * (e.g. the tracker's layer checklist) instead of reaching for a dedicated accordion primitive.
 */
@Component({
  selector: "app-gdpr",
  imports: [HlmBadge, HlmSkeleton, AppNavComponent, AppFooterComponent],
  templateUrl: "./gdpr.page.html",
})
export class GdprPage implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly isLoading = signal(true);
  private readonly _data = signal<PublicGdprDocument | undefined>(undefined);
  private unsubscribe: Unsubscribe | undefined;

  protected readonly definition = computed(() => this._data()?.definition ?? "");
  protected readonly intro = computed(() => this._data()?.intro ?? "");
  protected readonly details = computed(() => this._data()?.details ?? []);

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    const firestore = getFirestore(firebaseApp());
    this.unsubscribe = onSnapshot(
      firestoreDoc(firestore, "public", "gdpr"),
      (snap) => {
        this._data.set(snap.data() as PublicGdprDocument | undefined);
        this.isLoading.set(false);
      },
      () => this.isLoading.set(false),
    );
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }
}
