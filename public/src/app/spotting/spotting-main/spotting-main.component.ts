import { DialogService } from "ng-devui";

import { Component, OnInit } from "@angular/core";

import { SpottingFormComponent } from "../spotting-form/spotting-form.component";

@Component({
    selector: "app-spotting-main",
    templateUrl: "./spotting-main.component.html",
    styleUrls: ["./spotting-main.component.scss"],
})
export class SpottingMainComponent implements OnInit {
    constructor(private dialogService: DialogService) {}

    openStandardDialog(dialogtype?: string) {
        const results = this.dialogService.open({
            id: "dialog-service",
            width: "600px",
            maxHeight: "600px",
            title: "Add spotting entry",
            content: SpottingFormComponent,
            backdropCloseable: true,
            dialogtype: dialogtype,
            onClose: () => {
                return;
            },
            buttons: [
                {
                    cssClass: "primary",
                    text: "Submit",
                    handler: () => {
                        results.modalContentInstance.onSubmit();
                        // results.modalInstance.hide();
                    },
                },
                {
                    id: "btn-cancel",
                    cssClass: "common",
                    text: "Cancel",
                    handler: () => {
                        results.modalInstance.hide();
                    },
                },
            ],
            data: {
                canConfirm: (value: boolean) => {
                    results.modalInstance.updateButtonOptions([
                        { disabled: !value },
                    ]);
                },
            },
        });
        console.log(results.modalContentInstance);
    }

    ngOnInit(): void {
        return;
    }
}
