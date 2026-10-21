import { Component, inject, input, viewChild } from "@angular/core";
import { HlmButton } from "../../../ui/button/button";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../ui/sheet/sheet";
import { LinkFormComponent } from "../link-form/link-form.component";
import { LinkSheetService } from "../data/link-sheet.service";

/**
 * The shared link submit/edit sheet (Task unify): hosts the HlmSheet + LinkFormComponent pair
 * that previously lived inline in both `insiden.page.html` and the situasi section. Sheet open/
 * close/edit state flows through the shared LinkSheetService; the header/footer adapt to whether
 * the form is in edit mode ("Edit link"/"Save") or create mode ("Submit a link"/"Submit").
 *
 * `defaultLineIds` pre-targets submissions to a line (the situasi tab passes its line; the
 * /insiden page passes nothing). Reload-on-close is NOT this component's job: the link list
 * (LinkListComponent) emits `sheetClosed` for hosts to reload their own resource.
 */
@Component({
  selector: "app-link-sheet",
  imports: [HlmButton, HlmSheet, HlmSheetHeader, HlmSheetBody, HlmSheetFooter, LinkFormComponent],
  template: `
    <hlm-sheet
      [open]="linkSheet.isOpen()"
      (openChange)="linkSheet.setOpen($event)"
      side="right"
      [wide]="true"
    >
      <div hlmSheetHeader>
        <h2 class="text-base font-semibold">
          {{ linkSheet.editTarget() ? "Edit link" : "Submit a link" }}
        </h2>
      </div>
      <div hlmSheetBody>
        <!-- The form (and the fleet-wide reference read it starts) exists only once the sheet has
             been opened: closed sheets are mounted on Home, /insiden and every line's Situasi tab,
             and a form mounted with them would run that read during SSR and serialise it into
             every page's TransferState. Prefetching on idle keeps the first open quick. -->
        @defer (when linkSheet.isOpen(); prefetch on idle) {
          <!-- @if (true): the form is created in the block's own refresh, bound at once, not a tick late (NG0950). -->
          @if (true) {
            <app-link-form #linkForm [defaultLineIds]="defaultLineIds()" />
          }
        }
      </div>
      <div hlmSheetFooter>
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          [disabled]="linkFormRef()?.isSubmitting() ?? false"
          (click)="linkFormRef()?.clear()"
        >
          Clear form
        </button>
        <div class="flex items-center gap-2">
          <button hlmBtn variant="outline" (click)="linkSheet.close()">Cancel</button>
          <button
            hlmBtn
            data-testid="submit-link"
            [disabled]="!linkFormRef() || linkFormRef()?.isSubmitting()"
            (click)="linkFormRef()?.submit()"
          >
            {{
              linkFormRef()?.isSubmitting() ? "Saving…" : linkSheet.editTarget() ? "Save" : "Submit"
            }}
          </button>
        </div>
      </div>
    </hlm-sheet>
  `,
})
export class LinkSheetComponent {
  /** Line(s) a submission should be attached to (the situasi tab passes its line id; the
   * /insiden page passes nothing and keeps the just-dumping flow). */
  readonly defaultLineIds = input<string[]>([]);

  protected readonly linkSheet = inject(LinkSheetService);
  /** `undefined` until the sheet is first opened and its `@defer` block resolves. A string locator on
   * purpose: `viewChild(LinkFormComponent)` would reference the class as a value, keep its import
   * static and so ship the form in every host's chunk instead of loading it on idle. */
  protected readonly linkFormRef = viewChild<LinkFormComponent>("linkForm");
}
