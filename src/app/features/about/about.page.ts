import { isPlatformBrowser } from "@angular/common";
import { Component, OnDestroy, PLATFORM_ID, computed, inject, signal } from "@angular/core";
import { getApps, initializeApp } from "firebase/app";
import {
  Unsubscribe,
  doc as firestoreDoc,
  getFirestore,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { environment } from "../../../environments/environment";
import { AuthService } from "../../core/auth/auth.service";
import { resolveAdSlot } from "../../core/ads/ads.config";
import { HlmBadge } from "../../ui/badge/badge";
import { HlmButton } from "../../ui/button/button";
import { HlmCardImports } from "../../ui/card/card";
import { HlmCheckbox } from "../../ui/checkbox/checkbox";
import { HlmInput } from "../../ui/input/input";
import { HlmNativeSelect } from "../../ui/select/native-select";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { ToastService } from "../../ui/toast/toast.service";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import {
  Personnel,
  PersonnelSocial,
  Project,
  PublicAboutDocument,
  TechStack,
} from "./data/about.model";
import {
  draftFromDoc,
  emptyPersonnel,
  emptyProject,
  emptySocial,
  emptyTechStack,
  filterAndSortProjects,
  filterPersonnel,
  filterTechStacks,
  sanitizeDraft,
} from "./data/about-edit.util";

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
 * /about — content is entirely Firestore-driven (`public/about`). Previously hand-edited with no
 * app UI; admins now get an in-page editor (draft-in-signals, saved with `setDoc` — the doc the
 * snapshot listener already reads, so saves re-render the page live via the same subscription).
 * Client-rendered like /profile — this page also only ever runs Firebase SDK code in the
 * browser, and there's no SSR benefit to a doc that changes by hand rather than by request.
 */
@Component({
  selector: "app-about",
  imports: [
    HlmBadge,
    HlmButton,
    HlmCheckbox,
    HlmInput,
    HlmNativeSelect,
    HlmSkeleton,
    AdSlotComponent,
    AppNavComponent,
    AppFooterComponent,
    ...HlmCardImports,
  ],
  templateUrl: "./about.page.html",
})
export class AboutPage implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly footerEndSlotId = resolveAdSlot("footerEnd");
  protected readonly footerEndRightSlotId = resolveAdSlot("footerEndRight");
  protected readonly aboutBetweenSectionsSlotId = resolveAdSlot("aboutBetweenSections");

  protected readonly isLoading = signal(true);
  protected readonly isError = signal(false);
  private readonly _data = signal<PublicAboutDocument | undefined>(undefined);
  private unsubscribe: Unsubscribe | undefined;

  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly searchTerm = signal("");
  protected readonly editMode = signal(false);
  private readonly _draft = signal<PublicAboutDocument | undefined>(undefined);
  protected readonly draft = this._draft.asReadonly();

  protected readonly aboutProject = computed(() => this._data()?.aboutProject ?? "");
  protected readonly projects = computed(() =>
    filterAndSortProjects(this._data()?.projects ?? [], this.searchTerm()),
  );
  protected readonly personnel = computed(() =>
    filterPersonnel(this._data()?.personnel ?? [], this.searchTerm()),
  );
  protected readonly techStacks = computed(() =>
    filterTechStacks(this._data()?.techStacks ?? [], this.searchTerm()),
  );
  protected statusVariant = (status: string) => STATUS_VARIANT[status] ?? "neutral";

  /** Templates can't call `Number()` — `$any($event.target).value` is a string from a number input. */
  protected asNumber(value: unknown): number {
    return Number(value);
  }

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    this.subscribe();
  }

  private subscribe(): void {
    const firestore = getFirestore(firebaseApp());
    this.unsubscribe = onSnapshot(
      firestoreDoc(firestore, "public", "about"),
      (snap) => {
        this._data.set(snap.data() as PublicAboutDocument | undefined);
        this.isLoading.set(false);
      },
      () => {
        this.isError.set(true);
        this.isLoading.set(false);
      },
    );
  }

  protected retry(): void {
    this.isError.set(false);
    this.isLoading.set(true);
    this.unsubscribe?.();
    this.subscribe();
  }

  // --- Admin editor ---------------------------------------------------------

  /** Copy of the last snapshot, normalized so every input can bind; Firestore untouched until Save. */
  protected beginEdit(): void {
    const data = this._data();
    if (!data) {
      return;
    }
    this._draft.set(draftFromDoc(data));
    this.editMode.set(true);
  }

  protected cancelEdit(): void {
    this._draft.set(undefined);
    this.editMode.set(false);
  }

  protected async saveDraft(): Promise<void> {
    const draft = this._draft();
    if (!draft) {
      return;
    }
    try {
      await setDoc(
        firestoreDoc(getFirestore(firebaseApp()), "public", "about"),
        sanitizeDraft(draft),
      );
      this.cancelEdit();
      this.toast.success("Saved", "The about page has been updated.");
    } catch (err) {
      this.toast.error("Save failed", err instanceof Error ? err.message : "Unknown error");
    }
  }

  protected patchDraft(patch: Partial<PublicAboutDocument>): void {
    this._draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  private updateIn<K extends keyof PublicAboutDocument>(
    key: K,
    updater: (list: PublicAboutDocument[K]) => PublicAboutDocument[K],
  ): void {
    this._draft.update((d) => (d ? { ...d, [key]: updater(d[key]) } : d));
  }

  private updateItem<T>(list: T[], index: number, patch: Partial<T>): T[] {
    return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
  }

  protected updateProject(
    index: number,
    key: keyof Project,
    value: boolean | string | number,
  ): void {
    this.updateIn("projects", (list) =>
      this.updateItem(list as Project[], index, { [key]: value }),
    );
  }

  protected addProject(): void {
    this.updateIn("projects", (list) => [...(list as Project[]), emptyProject()]);
  }

  protected removeProject(index: number): void {
    this.updateIn("projects", (list) => (list as Project[]).filter((_, i) => i !== index));
  }

  protected updatePersonnel(
    index: number,
    key: keyof Personnel,
    value: boolean | string | number,
  ): void {
    this.updateIn("personnel", (list) =>
      this.updateItem(list as Personnel[], index, { [key]: value }),
    );
  }

  protected addPersonnel(): void {
    this.updateIn("personnel", (list) => {
      const items = list as Personnel[];
      return [...items, emptyPersonnel(items.length)];
    });
  }

  protected removePersonnel(index: number): void {
    this.updateIn("personnel", (list) => (list as Personnel[]).filter((_, i) => i !== index));
  }

  protected updateSocial(
    personIndex: number,
    socialIndex: number,
    key: keyof PersonnelSocial,
    value: string,
  ): void {
    this.updateIn("personnel", (list) =>
      (list as Personnel[]).map((p, i) =>
        i === personIndex
          ? { ...p, socials: this.updateItem(p.socials ?? [], socialIndex, { [key]: value }) }
          : p,
      ),
    );
  }

  protected addSocial(personIndex: number): void {
    this.updateIn("personnel", (list) =>
      (list as Personnel[]).map((p, i) =>
        i === personIndex ? { ...p, socials: [...(p.socials ?? []), emptySocial()] } : p,
      ),
    );
  }

  protected removeSocial(personIndex: number, socialIndex: number): void {
    this.updateIn("personnel", (list) =>
      (list as Personnel[]).map((p, i) =>
        i === personIndex
          ? { ...p, socials: (p.socials ?? []).filter((_, j) => j !== socialIndex) }
          : p,
      ),
    );
  }

  protected updateTechStack(index: number, key: keyof TechStack, value: string): void {
    this.updateIn("techStacks", (list) =>
      this.updateItem(list as TechStack[], index, { [key]: value }),
    );
  }

  protected addTechStack(): void {
    this.updateIn("techStacks", (list) => [...(list as TechStack[]), emptyTechStack()]);
  }

  protected removeTechStack(index: number): void {
    this.updateIn("techStacks", (list) => (list as TechStack[]).filter((_, i) => i !== index));
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }
}
