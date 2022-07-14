import { MutationResult } from "apollo-angular";
import { DialogService } from "ng-devui";
import { Observable } from "rxjs";

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
                        const submitAction =
                            results.modalContentInstance.onSubmit() as
                                | Observable<MutationResult<any>>
                                | undefined;
                        if (submitAction) {
                            submitAction.subscribe((mutationResult) => {
                                console.log(mutationResult);

                                if (!mutationResult.data?.loading) {
                                    if (mutationResult.data?.addEvent.id) {
                                        console.log("Mutation successful");
                                        // TODO: Dialog box

                                        results.modalInstance.hide();
                                    }
                                }
                            });
                        }
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
