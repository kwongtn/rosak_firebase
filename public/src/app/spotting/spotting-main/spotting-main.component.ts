import { MutationResult } from "apollo-angular";
import { DialogService } from "ng-devui";

import { Component, OnInit } from "@angular/core";

import { ToastService } from "../../services/toast/toast.service";
import { SpottingFormComponent } from "../spotting-form/spotting-form.component";

@Component({
    selector: "app-spotting-main",
    templateUrl: "./spotting-main.component.html",
    styleUrls: ["./spotting-main.component.scss"],
})
export class SpottingMainComponent implements OnInit {
    constructor(
        private dialogService: DialogService,
        private toastService: ToastService
    ) {}

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
                        const submitAction =
                            results.modalContentInstance.onSubmit() as
                                | Promise<MutationResult<any>>
                                | undefined;

                        submitAction
                            ?.then((mutationResult) => {
                                if (mutationResult.data?.addEvent.id) {
                                    console.log("Mutation successful");
                                    results.modalInstance.hide();
                                }

                                this.toastService.addToast({
                                    severity: "success",
                                    summary: "Success",
                                    content:
                                        "Your spotting entry is successfully added! 🥳",
                                });
                            })
                            .catch((reason) => {
                                console.error(reason);
                                this.toastService.addToast({
                                    severity: "error",
                                    summary: "Error",
                                    content: "Please try again.",
                                });
                            });
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
            data: {},
        });
        console.log(
            "results.modalContentInstance: ",
            results.modalContentInstance
        );
    }

    ngOnInit(): void {
        return;
    }
}
