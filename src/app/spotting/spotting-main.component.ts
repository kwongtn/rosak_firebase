import { Apollo, gql, MutationResult } from "apollo-angular";
import { DialogService } from "ng-devui";
import { firstValueFrom, Observable, Subscription } from "rxjs";
import {
    GetLinesAndVehiclesResponse,
    GetLinesResponse,
    LineStatus,
} from "src/app/models/query/get-vehicles";
import { TableDataType } from "src/app/models/spotting-table/source-type";
import {
    ImageUploadService,
} from "src/app/services/spotting/image-upload.service";
import { environment } from "src/environments/environment";

import { Component, OnDestroy, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import { ImageFile } from "../@ui/spotting/form-upload/form-upload.component";
import { ToastService } from "../services/toast/toast.service";
import { SpottingFormComponent } from "./spotting-form/spotting-form.component";
import { lineQueryResultToTabEntries, LineTabType } from "./utils";

const GET_LINES = gql`
    query GetLinesAndVehicles {
        lines {
            id
            code
            displayName
            status
        }
    }
`;

@Component({
    selector: "app-spotting-main",
    templateUrl: "./spotting-main.component.html",
    styleUrls: ["./spotting-main.component.scss"],
})
export class SpottingMainComponent implements OnInit, OnDestroy {
    env = environment;
    tableData: TableDataType[] = [];
    showLoading: boolean = true;

    tabActiveId: string | number | undefined = undefined;
    tabActiveTitle: string = "";
    tabItems: LineTabType[] = [];
    tabLineStatus: LineStatus = "ACTIVE";

    countIcon: number = 0;
    $countIcon: Subscription | undefined = undefined;

    $totalCountIcon: Observable<number> | undefined = undefined;
    $uploadPercentage: Observable<number> | undefined = undefined;

    hadUpload: boolean = false;

    currentDataId: string | undefined;
    vehicleAndLineData: GetLinesAndVehiclesResponse | undefined = undefined;

    private querySubscription!: Subscription;
    private routeSubscription!: Subscription;

    constructor(
        private dialogService: DialogService,
        private toastService: ToastService,
        private apollo: Apollo,
        private router: Router,
        private route: ActivatedRoute,
        private imageUploadService: ImageUploadService
    ) {}

    openStandardDialog(dialogtype?: string) {
        const results = this.dialogService.open({
            id: "dialog-service",
            title: "Add spotting entry",
            content: SpottingFormComponent,
            backdropCloseable: true,
            draggable: false,
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
                                | Promise<{
                                      spottingSubmission: Promise<
                                          MutationResult<any> | undefined
                                      >;
                                      uploads: ImageFile[];
                                  }>
                                | undefined;

                        submitAction
                            ?.then(async ({ spottingSubmission, uploads }) => {
                                const mutationResult = await spottingSubmission;

                                if (!mutationResult) {
                                    this.toastService.addToast(
                                        "Error",
                                        "Form is invalid.",
                                        "error"
                                    );
                                    return;
                                }

                                if (mutationResult.data?.addEvent.id) {
                                    console.log(
                                        `Mutation successful, adding ${uploads.length} file to upload queue.`
                                    );
                                    uploads.forEach((file) => {
                                        this.imageUploadService.addToQueue(
                                            mutationResult.data?.addEvent.id,
                                            file,
                                            "SPOTTING_EVENT"
                                        );
                                    });

                                    results.modalInstance.hide();
                                }

                                let toastMessage = "Spotting entry recorded! ";
                                if (uploads.length > 0) {
                                    toastMessage +=
                                        "Please wait for uploads to complete before closing this tab.";
                                } else {
                                    toastMessage += "🥳";
                                }

                                this.toastService.addMessage(
                                    toastMessage,
                                    "success"
                                );
                            })
                            .catch((reason) => {
                                console.log(reason);

                                this.toastService.addToast(
                                    "Error",
                                    reason.message,
                                    "error"
                                );
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
        this.routeSubscription = this.route.params.subscribe((params: any) => {
            this.currentDataId = params["id"];
        });

        this.$totalCountIcon =
            this.imageUploadService.$totalUploadCount.asObservable();
        this.$uploadPercentage =
            this.imageUploadService.$percentUploaded.asObservable();

        this.$countIcon = this.imageUploadService.$pendingUploadCount.subscribe(
            (count) => {
                this.countIcon = count;

                if (!this.hadUpload && count > 0) {
                    this.hadUpload = true;
                }
            }
        );

        this.apollo
            .query<GetLinesResponse>({
                query: GET_LINES,
            })
            .subscribe(({ data, loading }) => {
                this.showLoading = loading;

                this.tabItems = lineQueryResultToTabEntries(data);

                if (!this.currentDataId) {
                    this.tabActiveId = data.lines[0].id;
                    firstValueFrom(this.route.url).then((value) => {
                        this.router.navigate([value[0].path, data.lines[0].id]);
                    });
                } else {
                    this.tabActiveId = this.currentDataId;
                }

                this.setActiveTitle();
            });
    }

    ngOnDestroy() {
        // this.querySubscription.unsubscribe();
        this.routeSubscription.unsubscribe();
        this.$countIcon?.unsubscribe();
    }

    activeTabChange(event: any) {
        console.log("Active tab change: ", event);

        this.router.navigate(["spotting", event]);

        this.tabActiveId = event;
        // this.filterTabItems();
        this.setActiveTitle();
    }

    setActiveTitle() {
        const currObj = this.tabItems.find((val) => {
            return val.id === this.tabActiveId;
        });
        this.tabActiveTitle = currObj?.detail ?? "";
        this.tabLineStatus = currObj?.lineStatus ?? "ACTIVE";
    }
}
