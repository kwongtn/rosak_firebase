import { DatePipe } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import { HlmBadge } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { HlmCardImports } from "../../../../ui/card/card";
import { HlmInput } from "../../../../ui/input/input";
import { HlmNativeSelect } from "../../../../ui/select/native-select";
import { HlmTableImports } from "../../../../ui/table/table";
import { AppNavComponent } from "../../../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../../../shell/app-footer/app-footer.component";
import { ConsoleNavComponent } from "../../console-nav.component";
import {
  CONSOLE_CATEGORIES_QUERY,
  ConsoleCategoriesQueryData,
  MARK_LINK_COMPLETED_MUTATION,
  MarkLinkCompletedData,
  MarkLinkCompletedVars,
  SOCIAL_MEDIA_LINKS_QUERY,
  SocialMediaLinkRow,
  SocialMediaLinksQueryData,
  SocialMediaLinksQueryVars,
} from "../data/insiden-console.queries";
import {
  SEARCH_DEBOUNCE_MS,
  createTrailingDebounce,
  searchTermOrUndefined,
} from "../data/search-debounce.util";

type CompletedFilter = "any" | "pending" | "completed";

const COMPLETED_LABEL: Record<CompletedFilter, string> = {
  any: "All",
  pending: "Pending",
  completed: "Completed",
};

/**
 * /console/insiden/links — triage queue for crowd-submitted social media
 * posts. Text search (URL + title, matched server-side) is debounced; the
 * category dropdown and the All/Pending/Completed status select refetch
 * immediately. Mark-completed calls the admin mutation and reloads so the
 * row's completion state and timestamp come back as server truth.
 */
@Component({
  selector: "app-console-social-media-links",
  imports: [
    AppNavComponent,
    AppFooterComponent,
    DatePipe,
    HlmBadge,
    HlmButton,
    HlmInput,
    HlmNativeSelect,
    ...HlmCardImports,
    ...HlmTableImports,
    ConsoleNavComponent,
  ],
  templateUrl: "./links.component.html",
})
export class SocialMediaLinksComponent {
  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly searchDebouncer = createTrailingDebounce(SEARCH_DEBOUNCE_MS);

  protected readonly links = signal<SocialMediaLinkRow[]>([]);
  protected readonly categories = signal<{ id: string; name: string }[]>([]);
  protected readonly isLoading = signal(false);

  protected readonly searchTerm = signal("");
  protected readonly categoryId = signal("");
  protected readonly completedFilter = signal<CompletedFilter>("any");
  protected readonly completedFilterLabel = COMPLETED_LABEL;

  private appliedSearch: string | undefined;
  private appliedCategoryId = "";
  private appliedCompleted: CompletedFilter = "any";

  constructor() {
    this.load();
    this.loadCategories();
  }

  protected eventValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.searchDebouncer.push(() => {
      this.appliedSearch = searchTermOrUndefined(this.searchTerm());
      this.load();
    });
  }

  protected onCategoryChange(value: string): void {
    this.categoryId.set(value);
    this.appliedCategoryId = value;
    this.load();
  }

  protected onCompletedFilterChange(value: string): void {
    this.completedFilter.set(value as CompletedFilter);
    this.appliedCompleted = value as CompletedFilter;
    this.load();
  }

  protected async markCompleted(link: SocialMediaLinkRow): Promise<void> {
    this.isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<MarkLinkCompletedData, MarkLinkCompletedVars>(
        MARK_LINK_COMPLETED_MUTATION,
        { linkId: link.id },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.toast.success("Link marked completed", link.url);
      await this.fetchLinks();
    } catch (err) {
      this.toast.error(
        "Couldn't mark completed",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  private async load(): Promise<void> {
    if (this.isLoading()) {
      return;
    }
    this.isLoading.set(true);
    try {
      await this.fetchLinks();
    } finally {
      this.isLoading.set(false);
    }
  }

  /** The actual links query, without load()'s re-entrancy guard — callers
   * that already hold the loading flag (markCompleted) use this directly. */
  private async fetchLinks(): Promise<void> {
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<SocialMediaLinksQueryData, SocialMediaLinksQueryVars>(
        SOCIAL_MEDIA_LINKS_QUERY,
        {
          search: this.appliedSearch,
          categoryId: this.appliedCategoryId || undefined,
          completed:
            this.appliedCompleted === "any" ? undefined : this.appliedCompleted === "completed",
        },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.links.set(data.socialMediaLinks);
    } catch (err) {
      this.toast.error("Couldn't load links", err instanceof Error ? err.message : "Unknown error");
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<ConsoleCategoriesQueryData>(
        CONSOLE_CATEGORIES_QUERY,
        undefined,
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.categories.set(data.calendarIncidentCategories);
    } catch (err) {
      this.toast.error(
        "Couldn't load categories",
        err instanceof Error ? err.message : "Unknown error",
      );
    }
  }
}
