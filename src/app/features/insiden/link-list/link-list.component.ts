import { Component, computed, effect, inject, input, output, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { AuthService } from "../../../core/auth/auth.service";
import { LinkCardComponent } from "../link-card/link-card.component";
import { canEditLink } from "../data/can-edit.link.util";
import { LinkCardItem } from "../data/link-card-item";
import { groupLinksByDay, linkDateKey } from "../data/link-day-group.util";
import { LinkSheetService } from "../data/link-sheet.service";
import { PublicSocialMediaLink } from "../data/social-links.queries";

/**
 * The shared, host-agnostic link list (Task unify): approved links first (day-grouped via
 * `groupLinksByDay` — the single date-grouping mechanism, UTC so SSR and the viewer's tz agree),
 * then a collapsed-by-default "Pending (N)" collapsible. Edit pencils are author-or-admin gated
 * (canEditLink + LinkSheetService.openEdit) and the edit sheet closes through the shared service.
 *
 * Data lifecycle stays with the host: this component takes an ordered `links` array and emits
 * `sheetClosed` on the sheet's open→closed edge so the host can reload its own resource (and, for
 * paginated hosts, drop continuation pages of the stale dataset). Empty state is a host-provided
 * message so /insiden and the situasi tab keep their distinct copy.
 */
@Component({
  selector: "app-link-list",
  imports: [DatePipe, LinkCardComponent],
  template: `
    @if (links().length === 0) {
      <p class="text-muted-foreground text-sm">{{ emptyMessage() }}</p>
    } @else {
      <div class="flex flex-col gap-4">
        @for (group of approvedGroups(); track group.key) {
          <div class="flex flex-col gap-2">
            @if (group.label) {
              <h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
                {{ group.label }}
              </h2>
            } @else if (group.key) {
              <h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
                {{ group.key | date: "MMMM d, y" : "UTC" }}
              </h2>
            }
            <div class="flex flex-col gap-2">
              @for (link of group.items; track link.id) {
                <app-link-card
                  [link]="link"
                  [userVote]="voteValues()[link.id] ?? link.userVote ?? 0"
                  [editable]="canEdit(link)"
                  (voteChanged)="voteChanged.emit({ id: link.id, value: $event.value })"
                  (edit)="openEdit($event)"
                />
              }
            </div>
          </div>
        }
        @if (pending().length > 0) {
          <div class="flex flex-col gap-4">
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 self-start text-sm font-semibold tracking-wide uppercase"
              [attr.aria-expanded]="pendingExpanded()"
              (click)="pendingExpanded.set(!pendingExpanded())"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-4 shrink-0 transition-transform"
                [class.rotate-180]="pendingExpanded()"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
              Pending ({{ pending().length }})
            </button>
            @if (pendingExpanded()) {
              <div class="flex flex-col gap-2">
                @for (link of pending(); track link.id) {
                  <app-link-card
                    [link]="link"
                    [userVote]="voteValues()[link.id] ?? link.userVote ?? 0"
                    [editable]="canEdit(link)"
                    (voteChanged)="voteChanged.emit({ id: link.id, value: $event.value })"
                    (edit)="openEdit($event)"
                  />
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class LinkListComponent {
  /** Ordered links (backend order, newest-first) — the host owns fetching/pagination/polling. */
  readonly links = input<PublicSocialMediaLink[]>([]);

  /** Host-specific empty copy ("No submitted links yet." on /insiden, "...for this line yet." on
   * the situasi tab). */
  readonly emptyMessage = input("No submitted links yet.");

  /** Emitted on the link sheet's open→closed edge: an edit submit or cancel changed the data
   * server-side, so the host should reload its resource (and drop stale continuation pages). */
  readonly sheetClosed = output<void>();

  /** Per-link vote overlay, keyed by link id (the host's optimistic copy — `link.userVote` is the
   * anonymous backend value). The host updates it on `voteChanged`. */
  readonly voteValues = input<Record<string, number>>({});

  /** Re-emitted per card with the voted link's id, so the host can record it in its own store. */
  readonly voteChanged = output<{ id: string; value: number }>();

  private readonly auth = inject(AuthService);
  private readonly linkSheet = inject(LinkSheetService);

  /** "Approved" = anything not awaiting admin approval: the approval axis is `status`
   * (`PENDING_APPROVAL` vs everything else). `completed` is the admin console's separate
   * "mark handled" flag and must not drive this split. */
  protected readonly approved = computed(() =>
    this.links().filter((link) => link.status !== "PENDING_APPROVAL"),
  );
  protected readonly pending = computed(() =>
    this.links().filter((link) => link.status === "PENDING_APPROVAL"),
  );

  /** Approved links bucketed by UTC day (created-DESC preserved within each day). */
  protected readonly approvedGroups = computed(() =>
    groupLinksByDay(this.approved(), linkDateKey(new Date().toISOString())),
  );

  /** Collapsed by default — pending links stay out of the way until explicitly requested. */
  protected readonly pendingExpanded = signal(false);

  /** Author-or-admin gate for the card's edit pencil (see can-edit.link.util). */
  protected canEdit(link: PublicSocialMediaLink): boolean {
    return canEditLink(link, {
      isLoggedIn: this.auth.isLoggedIn(),
      isAdmin: this.auth.isAdmin(),
      userId: this.auth.user()?.uid ?? null,
    });
  }

  /** Opens the sheet in edit mode for the clicked link (the host may host the sheet itself — the
   * shared LinkSheetService carries the edit target regardless of where the sheet renders). */
  protected openEdit(link: LinkCardItem): void {
    this.linkSheet.openEdit(link);
  }

  private _wasSheetOpen = false;

  constructor() {
    effect(() => {
      const isOpen = this.linkSheet.isOpen();
      if (!isOpen && this._wasSheetOpen) {
        this.sheetClosed.emit();
      }
      this._wasSheetOpen = isOpen;
    });
  }
}
