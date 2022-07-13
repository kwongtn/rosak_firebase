import { CascaderItem } from "ng-devui";
import { FormLayout } from "ng-devui/form";
import { AppendToBodyDirection } from "ng-devui/utils";

import { Component, OnInit } from "@angular/core";
import {
    FormBuilder,
    FormControl,
    FormGroup,
    Validators,
} from "@angular/forms";

@Component({
    selector: "app-spotting-form",
    templateUrl: "./spotting-form.component.html",
    styleUrls: ["./spotting-form.component.scss"],
})
export class SpottingFormComponent implements OnInit {
    layoutDirection: FormLayout = FormLayout.Horizontal;
    appendToBodyDirections: AppendToBodyDirection[] = [
        "rightDown",
        "centerDown",
    ];
    submitButtonClicked: boolean = false;

    vehicleOptions: CascaderItem[] = [
        {
            label: "KJL - MRT Kajang Line",
            value: 1,
            children: [
                {
                    label: "B.Innov. 2-Car",
                    value: 1,
                    children: [
                        {
                            label: "01 @ SBK",
                            value: 1,
                            isLeaf: true,
                        },
                        {
                            label: "02 @ SBK",
                            value: 2,
                            isLeaf: true,
                        },
                        {
                            label: "03 @ SBK",
                            value: 3,
                            isLeaf: true,
                        },
                    ],
                },
            ],
            isLeaf: false,
            disabled: false,
            icon: "icon-folder",
        },
    ];

    statusOptions = [
        { name: "In Service", value: "IN_SERVICE" },
        { name: "Not Spotted", value: "NOT_SPOTTED" },
        { name: "Decommissioned", value: "DECOMMISSIONED" },
        { name: "Testing", value: "TESTING" },
        { name: "Unknown", value: "UNKNOWN" },
    ];

    typeOptions = [
        {
            name: "Depot",
            value: "DEPOT",
        },
        {
            name: "Location",
            value: "LOCATION",
            disabled: true,
        },
        {
            name: "Between Stations",
            value: "BETWEEN_STATIONS",
        },
    ];

    // TODO: Check that origin and destination options are not the same
    stationOptions: CascaderItem[] = [
        {
            label: "KGL - MRT Kajang Line",
            value: 1,
            children: [
                { value: 1, label: "KG04 - Kwasa Damansara" },
                { value: 2, label: "KG05 - Kwasa Sentral" },
                { value: 3, label: "KG06 - Kota Damansara" },
                { value: 4, label: "KG07 - Surian" },
                { value: 5, label: "KG08 - Mutiara Damansara" },
                { value: 6, label: "KG09 - Bandar Utama" },
                { value: 7, label: "KG10 - Taman Tun Dr Ismail (TTDI)" },
                { value: 8, label: "KG11 - Phileo Damansara" },
                { value: 9, label: "KG12 - Pusat Bandar Damansara" },
                { value: 10, label: "KG14 - Semantan" },
                { value: 11, label: "KG15 - Muzium Negara" },
                { value: 12, label: "KG16 - Pasar Seni" },
                { value: 13, label: "KG17 - Merdeka" },
                { value: 14, label: "KG18A - Bukit Bintang" },
                { value: 15, label: "KG20 - Tun Razak Exchange (TRX)" },
                { value: 16, label: "KG21 - Cochrane" },
                { value: 17, label: "KG22 - Maluri" },
                { value: 18, label: "KG23 - Taman Pertama" },
                { value: 19, label: "KG24 - Taman Midah" },
                { value: 20, label: "KG25 - Taman Mutiara" },
                { value: 21, label: "KG26 - Taman Connaught" },
                { value: 22, label: "KG27 - Taman Suntex" },
                { value: 23, label: "KG28 - Sri Raya" },
                { value: 24, label: "KG29 - Bandar Tun Hussein Onn" },
                { value: 25, label: "KG30 - Batu 11 Cheras" },
                { value: 26, label: "KG31 - Bukit Dukung" },
                { value: 27, label: "KG33 - Sungai Jernih" },
                { value: 28, label: "KG34 - Stadium Kajang" },
                { value: 29, label: "KG35 - Kajang" },
            ],
            isLeaf: false,
            disabled: false,
            icon: "icon-folder",
        },
    ];

    getStatus(fieldName: string): null | "success" | "error" {
        if (this.formGroup.controls[fieldName].valid) {
            return "success";
        } else if (
            !this.submitButtonClicked &&
            this.formGroup.controls[fieldName].pristine
        ) {
            return null;
        } else {
            return "error";
        }
    }

    /**
     * Form stuff
     */
    formGroup: FormGroup;
    selectedDate1 = new Date();

    constructor(private fb: FormBuilder) {
        this.formGroup = this.fb.group({
            vehicle: new FormControl("", [Validators.required]),
            spottingDate: new FormControl(new Date(), [Validators.required]),
            status: new FormControl(
                {
                    name: "In Service",
                    value: "IN_SERVICE",
                },
                [Validators.required]
            ),
            type: new FormControl(
                {
                    name: "Between Stations",
                    value: "BETWEEN_STATIONS",
                },
                [Validators.required]
            ),
            originStation: new FormControl("", [Validators.required]),
            destinationStation: new FormControl("", [Validators.required]),
            notes: new FormControl("", []),
        });
    }

    ngOnInit(): void {
        return;
    }

    onChanges(event: Event): void {
        console.log(event);
        return;
    }

    onSubmit(): void {
        console.log(this.formGroup);
        this.submitButtonClicked = true;

        return;
    }
}
