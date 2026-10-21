import { Component, inject, viewChild } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { HlmButton } from "../../../ui/button/button";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../ui/sheet/sheet";
import { AppNavComponent } from "../../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../../shell/app-footer/app-footer.component";
import { AdSlotComponent } from "../../../ui/ad-slot/ad-slot.component";
import { resolveAdSlot } from "../../../core/ads/ads.config";
import { ReportFormComponent } from "../report-form/report-form.component";
import { ReportSheetService } from "../data/report-sheet.service";

/**
 * Hosts every /spotting/** child route plus the "Add a Spotting Entry" sheet, which is
 * cross-cutting (reachable from any line/vehicle page) rather than nested under one — see the
 * routing rationale in archive/frontend-map/spotting.md and the rewrite plan. The sheet is opened
 * via ReportSheetService by trigger buttons living on the child pages themselves, not from here.
 */
@Component({
  selector: "app-spotting-shell",
  imports: [
    RouterOutlet,
    HlmButton,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
    AppNavComponent,
    AppFooterComponent,
    AdSlotComponent,
    ReportFormComponent,
  ],
  template: `
    <app-nav />
    <div class="mx-auto flex min-h-screen w-full flex-col gap-6 p-4 sm:p-6 lg:w-[90%]">
      <main class="flex flex-1 flex-col gap-6">
        <router-outlet />
      </main>

      <div class="grid gap-3 sm:grid-cols-2">
        <app-ad-slot [slotId]="footerEndSlotId" [minHeightPx]="250" [label]="'Advertisement'" />
        <app-ad-slot
          [slotId]="footerEndRightSlotId"
          [minHeightPx]="250"
          [label]="'Advertisement'"
        />
      </div>

      <app-footer />
    </div>

    <hlm-sheet
      [open]="reportSheet.isOpen()"
      (openChange)="reportSheet.setOpen($event)"
      side="right"
    >
      <div hlmSheetHeader>
        <h2 class="text-base font-semibold">Add a Spotting Entry</h2>
      </div>
      <div hlmSheetBody>
        <!-- The form (and its fleet-wide LinesAndVehicles read) exists only once the sheet has been
             opened: mounted with the shell it ran during SSR and rode in TransferState on every
             /spotting page. @defer never renders on the server; prefetch keeps the first open
             quick. Inside the block the form is out of the footer's reach, hence reportFormRef(). -->
        @defer (when reportSheet.isOpen(); prefetch on idle) {
          <app-report-form #reportForm (submitted)="reportSheet.setOpen(false)" />
        }
      </div>
      <div hlmSheetFooter>
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          [disabled]="reportFormRef()?.isSubmitting()"
          (click)="reportFormRef()?.clear()"
        >
          Clear form
        </button>
        <div class="flex items-center gap-2">
          <button hlmBtn variant="outline" (click)="reportSheet.setOpen(false)">Cancel</button>
          <button
            hlmBtn
            [disabled]="
              !reportFormRef() ||
              reportFormRef()?.isSubmitting() ||
              reportFormRef()?.isPhotosCompressing()
            "
            (click)="reportFormRef()?.submit()"
          >
            {{
              reportFormRef()?.isSubmitting()
                ? "Submitting…"
                : reportFormRef()?.isPhotosCompressing()
                  ? "Processing photos…"
                  : "Submit"
            }}
          </button>
        </div>
      </div>
    </hlm-sheet>
  `,
})
export class SpottingShellPage {
  protected readonly footerEndSlotId = resolveAdSlot("footerEnd");
  protected readonly footerEndRightSlotId = resolveAdSlot("footerEndRight");

  protected readonly reportSheet = inject(ReportSheetService);

  /** The form inside the sheet's `@defer` block — `undefined` until the sheet is first opened. */
  protected readonly reportFormRef = viewChild<ReportFormComponent>("reportForm");
}
