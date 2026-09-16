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
          {{ linkFormRef()?.isEditing() ? "Edit link" : "Submit a link" }}
        </h2>
      </div>
      <div hlmSheetBody>
        <app-link-form [defaultLineIds]="defaultLineIds()" />
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
            [disabled]="linkFormRef()?.isSubmitting() ?? false"
            (click)="linkFormRef()?.submit()"
          >
            {{
              linkFormRef()?.isSubmitting()
                ? "Saving…"
                : linkFormRef()?.isEditing()
                  ? "Save"
                  : "Submit"
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
  protected readonly linkFormRef = viewChild(LinkFormComponent);
}
