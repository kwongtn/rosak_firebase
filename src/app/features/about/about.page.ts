import { isPlatformBrowser } from "@angular/common";
import { Component, OnDestroy, PLATFORM_ID, computed, inject, signal } from "@angular/core";
import { getApps, initializeApp } from "firebase/app";
import { Unsubscribe, doc as firestoreDoc, getFirestore, onSnapshot } from "firebase/firestore";
import { environment } from "../../../environments/environment";
import { HlmBadge } from "../../ui/badge/badge";
import { HlmButton } from "../../ui/button/button";
import { HlmCardImports } from "../../ui/card/card";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { PublicAboutDocument } from "./data/about.model";

function firebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}

const STATUS_VARIANT: Record<string, "warning" | "info" | "success" | "neutral"> = {
  alpha: "warning",
  beta: "info",
  stable: "success",
  planned: "neutral",
};

/**
 * /about — ported from about.component.ts: content is entirely Firestore-driven (`public/about`,
 * admin-edited, no app UI writes to it), not static copy. Client-rendered like /profile — this
 * page also only ever runs Firebase SDK code in the browser, and there's no SSR benefit to a
 * doc that changes by hand rather than by request.
 */
@Component({
  selector: "app-about",
  imports: [
    HlmBadge,
    HlmButton,
    HlmSkeleton,
    AppNavComponent,
    AppFooterComponent,
    ...HlmCardImports,
  ],
  templateUrl: "./about.page.html",
})
export class AboutPage implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly isLoading = signal(true);
  private readonly _data = signal<PublicAboutDocument | undefined>(undefined);
  private unsubscribe: Unsubscribe | undefined;

  protected readonly aboutProject = computed(() => this._data()?.aboutProject ?? "");
  protected readonly projects = computed(() =>
    (this._data()?.projects ?? []).filter((p) => p.display),
  );
  protected readonly personnel = computed(() =>
    [...(this._data()?.personnel ?? [])]
      .filter((p) => p.display && p.name)
      .sort((a, b) => a.order - b.order)
      // Firestore docs are hand-edited — not every entry reliably has a `socials` array.
      .map((p) => ({ ...p, socials: p.socials ?? [] })),
  );
  protected readonly techStacks = computed(() => this._data()?.techStacks ?? []);
  protected readonly statusVariant = (status: string) => STATUS_VARIANT[status] ?? "neutral";

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    const firestore = getFirestore(firebaseApp());
    this.unsubscribe = onSnapshot(
      firestoreDoc(firestore, "public", "about"),
      (snap) => {
        this._data.set(snap.data() as PublicAboutDocument | undefined);
        this.isLoading.set(false);
      },
      () => this.isLoading.set(false),
    );
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }
}
