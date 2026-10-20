import { Component, OnDestroy, computed, inject, signal } from "@angular/core";
import { DOCUMENT, NgTemplateOutlet } from "@angular/common";
import { Meta } from "@angular/platform-browser";
import { RouterLink } from "@angular/router";
import { getApps, initializeApp } from "firebase/app";
import {
  Unsubscribe,
  doc as firestoreDoc,
  getFirestore,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { injectIsBrowser } from "../../core/composables/is-browser";
import { environment } from "../../../environments/environment";
import { AuthService } from "../../core/auth/auth.service";
import { resolveAdSlot } from "../../core/ads/ads.config";
import { AvatarComponent } from "../../ui/avatar/avatar";
import { HlmBadge } from "../../ui/badge/badge";
import { HlmButton } from "../../ui/button/button";
import { HlmCardImports } from "../../ui/card/card";
import { ExternalLinkIconComponent } from "../../ui/external-link-icon/external-link-icon";
import { HlmInput } from "../../ui/input/input";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { ToastService } from "../../ui/toast/toast.service";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { Personnel, Project, PublicAboutDocument } from "./data/about.model";
import {
  filterAndSortProjects,
  filterCommunityProjects,
  filterPersonnel,
  filterTechStacks,
  formatPersonPeriod,
  formatProjectStart,
} from "./data/about-edit.util";
import { AboutEditorComponent } from "./editor/about-editor.component";

function firebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}

const META_DESCRIPTION =
  "About the MLPTF community platform: the team, the projects, the open-source tech behind them, and how to support the work.";

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
    AboutEditorComponent,
    AvatarComponent,
    ExternalLinkIconComponent,
    HlmBadge,
    HlmButton,
    HlmInput,
    HlmSkeleton,
    AdSlotComponent,
    AppNavComponent,
    AppFooterComponent,
    RouterLink,
    NgTemplateOutlet,
    ...HlmCardImports,
  ],
  templateUrl: "./about.page.html",
})
export class AboutPage implements OnDestroy {
  private readonly isBrowser = injectIsBrowser();
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);

  protected readonly footerEndSlotId = resolveAdSlot("footerEnd");
  protected readonly footerEndRightSlotId = resolveAdSlot("footerEndRight");
  protected readonly aboutBetweenSectionsSlotId = resolveAdSlot("aboutBetweenSections");

  protected readonly isLoading = signal(true);
  protected readonly isError = signal(false);
  private readonly _data = signal<PublicAboutDocument | undefined>(undefined);
  protected readonly data = this._data.asReadonly();
  private unsubscribe: Unsubscribe | undefined;

  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly searchTerm = signal("");
  protected readonly editMode = signal(false);
  protected readonly saving = signal(false);

  protected readonly aboutProject = computed(() => this._data()?.aboutProject ?? "");
  protected readonly projects = computed(() =>
    filterAndSortProjects(this._data()?.projects ?? [], this.searchTerm()),
  );
  protected readonly personnel = computed(() =>
    filterPersonnel(this._data()?.personnel ?? [], this.searchTerm()),
  );
  protected readonly activePersonnel = computed(() => this.personnel().filter((p) => !p.retired));
  protected readonly retiredPersonnel = computed(() => this.personnel().filter((p) => p.retired));
  protected readonly techStacks = computed(() =>
    filterTechStacks(this._data()?.techStacks ?? [], this.searchTerm()),
  );
  protected readonly communityProjects = computed(() =>
    filterCommunityProjects(this._data()?.communityProjects ?? [], this.searchTerm()),
  );
  private readonly visibleCount = computed(
    () =>
      this.projects().length +
      this.personnel().length +
      this.techStacks().length +
      this.communityProjects().length,
  );
  /** Doc missing or with nothing visible — distinct from "search matched nothing". */
  protected readonly isEmptyDoc = computed(
    () => !this.aboutProject() && this.searchTerm().trim() === "" && this.visibleCount() === 0,
  );
  protected readonly noResults = computed(
    () => this.searchTerm().trim() !== "" && this.visibleCount() === 0,
  );
  /** Jump links for the sections that currently have something to show. */
  protected readonly sectionLinks = computed(() =>
    [
      { id: "projects", label: "Projects", show: this.projects().length > 0 },
      { id: "team", label: "Team", show: this.personnel().length > 0 },
      { id: "tech-stack", label: "Tech stack", show: this.techStacks().length > 0 },
      { id: "community", label: "Community", show: this.communityProjects().length > 0 },
    ].filter((link) => link.show),
  );
  protected statusVariant = (status: string) => STATUS_VARIANT[status] ?? "neutral";

  /** "Started Jan 2024", or "" for a planned project or one with no valid start date. */
  protected projectStart(project: Project): string {
    return formatProjectStart(project);
  }

  /** "Jan 2024 - Present · 2 years 3 months", or "" when no valid start date. */
  protected personPeriod(person: Personnel): string {
    return formatPersonPeriod(person);
  }

  constructor() {
    // Client-rendered, so this helps crawlers that run JS (Google); link-preview scrapers
    // (WhatsApp/Telegram) still see only the static index.html tags.
    const meta = inject(Meta);
    meta.updateTag({ name: "description", content: META_DESCRIPTION });
    meta.updateTag({ property: "og:title", content: "MLPTF | About" });
    meta.updateTag({ property: "og:description", content: META_DESCRIPTION });
    meta.updateTag({ property: "og:type", content: "website" });
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

  /** A plain `#id` href would resolve against `<base href="/">` and leave the page. */
  protected jumpTo(id: string): void {
    const el = this.document.getElementById(id);
    if (!el) {
      return;
    }
    const reduceMotion = this.document.defaultView?.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }

  protected clearSearch(): void {
    this.searchTerm.set("");
  }

  protected retry(): void {
    this.isError.set(false);
    this.isLoading.set(true);
    this.unsubscribe?.();
    this.subscribe();
  }

  // --- Admin editor ---------------------------------------------------------
  // The form itself lives in `AboutEditorComponent`; the page owns visibility and persistence.

  protected beginEdit(): void {
    this.editMode.set(true);
  }

  protected cancelEdit(): void {
    this.editMode.set(false);
  }

  /** Writes the editor's sanitized doc; the live snapshot then re-renders the page. */
  protected async saveDoc(doc: PublicAboutDocument): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await setDoc(firestoreDoc(getFirestore(firebaseApp()), "public", "about"), doc);
      this.cancelEdit();
      this.toast.success("Saved", "The about page has been updated.");
    } catch (err) {
      this.toast.error("Save failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      this.saving.set(false);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }
}
