import { Component, inject, input } from "@angular/core";
import { HlmButton } from "../../../ui/button/button";
import { ImageUploadService } from "../../../core/upload/image-upload.service";
import { ReportSheetService } from "../data/report-sheet.service";

/**
 * The one and only entry point into the "Add a Spotting Entry" sheet — deliberately placed
 * in-page (line-overview, vehicle-detail) rather than docked in the top nav, per the redesign:
 * it's a page action, not a nav action.
 */
@Component({
    selector: "app-report-spotting-button",
    imports: [HlmButton],
    template: `
        <button hlmBtn [class]="userClass()" (click)="reportSheet.open()">
            Add a Spotting Entry
            @if (uploads.pendingCount() > 0) {
                <span class="bg-primary-foreground/20 rounded-full px-1.5 text-xs">{{ uploads.pendingCount() }}</span>
            }
        </button>
    `,
})
export class ReportSpottingButtonComponent {
    readonly userClass = input<string>("", { alias: "class" });

    protected readonly reportSheet = inject(ReportSheetService);
    protected readonly uploads = inject(ImageUploadService);
}
