import { Component, computed, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import { hlm } from "../../../ui/utils/hlm";
import { PublicSocialMediaLink } from "../../insiden/data/social-links.queries";
import { linkStatusLabel, linkStatusVariant } from "./my-links-status.util";

/**
 * One row of "My Submitted Links": the selection checkbox, the outbound link card and the row's
 * structural verbs (Ungroup / Move up / Move down / Nest ticked here). Purely presentational —
 * every gate (the move/nest blocked reasons), the depth indent applied by the PARENT on the host
 * and the conversation badge label are computed by `<app-my-links>` and passed in, so the row
 * holds no state and makes no decisions.
 *
 * The host is the `hlmCard` div itself (attribute selector), so the card chrome, the
 * `data-testid="row-<id>"` / `data-depth` attributes and the indent class stay on the exact same
 * element the specs query.
 */
@Component({
  selector: "div[app-my-links-row]",
  imports: [DatePipe, HlmBadge, HlmButton, HlmCheckbox],
  template: `
    <div class="flex items-start gap-3">
      <label class="flex shrink-0 items-center pt-0.5">
        <hlm-checkbox
          [checked]="selected()"
          [attr.data-testid]="'select-link-' + link().id"
          (checkedChange)="toggleSelected.emit()"
        />
        <!-- Visually hidden because the row's own title already names the link;
             the checkbox still needs an accessible name of its own. -->
        <span class="sr-only">Select {{ link().title || link().url }}</span>
      </label>

      <a
        [href]="link().url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex min-w-0 flex-1 flex-col gap-2.5"
        [class]="_rowLinkClass()"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex min-w-0 flex-col gap-1">
            <span class="line-clamp-1 text-sm font-semibold">
              {{ link().title || link().url }}
            </span>
            @if (link().title) {
              <span class="text-muted-foreground line-clamp-1 text-xs">
                {{ link().url }}
              </span>
            }
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <span class="text-muted-foreground text-xs whitespace-nowrap">
              {{ link().created | date: "MMM d, y HH:mm" }}
            </span>
            <span hlmBadge [variant]="linkStatusVariant(link())">
              {{ linkStatusLabel(link()) }}
            </span>
          </div>
        </div>
      </a>
    </div>

    <!-- The row's structural actions. Unconditional, because unlike the old
         depth-1 model every row is now a candidate for all of them: a ROOT is a
         valid nest target, a LEAF is a valid thing to move, and a disabled
         control with a title explaining itself is more honest than a control
         that silently is not there. -->
    <div class="flex flex-wrap items-center gap-2">
      <!-- threadLabel answers "" for a conversation of one, and
           sublinkCount + 1 IS the conversation size, so the badge's own
           non-empty test is exactly the "sublinkCount > 0" gate. NEVER
           isThreadRoot: it is true of every ungrouped link in the app. -->
      @if (conversationLabel(); as label) {
        <span hlmBadge variant="outline" [attr.data-testid]="'thread-badge-' + link().id">
          Thread · {{ label }}
        </span>
      }
      <!-- Ungroup ONLY on a row that HAS a parent. Under the tree a root is
           the head of its conversation, not a row in no group: there is
           nothing to detach, and its sublinks stay attached to it either
           way, so a button here would promise a cascade that deliberately
           does not exist. -->
      @if (link().parentId) {
        <button
          type="button"
          hlmBtn
          variant="ghost"
          size="xs"
          [attr.data-testid]="'ungroup-' + link().id"
          [disabled]="threading()"
          (click)="ungroup.emit()"
        >
          Ungroup
        </button>
      }
      <button
        type="button"
        hlmBtn
        variant="ghost"
        size="xs"
        [attr.data-testid]="'move-up-' + link().id"
        [title]="moveUpReason() ?? ''"
        [disabled]="moveUpReason() !== null"
        (click)="moveUp.emit()"
      >
        Move up
      </button>
      <button
        type="button"
        hlmBtn
        variant="ghost"
        size="xs"
        [attr.data-testid]="'move-down-' + link().id"
        [title]="moveDownReason() ?? ''"
        [disabled]="moveDownReason() !== null"
        (click)="moveDown.emit()"
      >
        Move down
      </button>
      <button
        type="button"
        hlmBtn
        variant="ghost"
        size="xs"
        aria-describedby="my-links-thread-hint"
        [attr.data-testid]="'nest-' + link().id"
        [title]="nestReason() ?? ''"
        [disabled]="nestReason() !== null"
        (click)="nest.emit()"
      >
        Nest ticked here
      </button>
    </div>
  `,
})
export class MyLinksRowComponent {
  readonly link = input.required<PublicSocialMediaLink>();
  readonly selected = input.required<boolean>();
  readonly threading = input.required<boolean>();
  /** `threadLabel(sublinkCount + 1)`, or `""` for a leaf — computed by the parent. */
  readonly conversationLabel = input.required<string>();
  /** `null` means the move is available; otherwise the reason shown in the button's title. */
  readonly moveUpReason = input<string | null>(null);
  readonly moveDownReason = input<string | null>(null);
  /** `null` means the nest target is available; otherwise the reason for the title. */
  readonly nestReason = input<string | null>(null);

  readonly toggleSelected = output<void>();
  readonly ungroup = output<void>();
  readonly moveUp = output<void>();
  readonly moveDown = output<void>();
  readonly nest = output<void>();

  protected readonly linkStatusLabel = linkStatusLabel;
  protected readonly linkStatusVariant = linkStatusVariant;

  /** A row's own link area: a ticked row is tinted so the selection is legible without
   *  counting checkboxes. `hlm()` merges the two halves so a conditional class can never
   *  lose (or win) a Tailwind conflict against the static one. */
  protected readonly _rowLinkClass = computed(() =>
    hlm("rounded-lg", this.selected() && "bg-primary/5"),
  );
}
