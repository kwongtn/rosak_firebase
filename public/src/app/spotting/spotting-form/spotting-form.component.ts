import { FormLayout } from "ng-devui/form";

import { Component, OnInit } from "@angular/core";

@Component({
    selector: "app-spotting-form",
    templateUrl: "./spotting-form.component.html",
    styleUrls: ["./spotting-form.component.scss"],
})
export class SpottingFormComponent implements OnInit {
    layoutDirection: FormLayout = FormLayout.Horizontal;
    inputDemoConfig: any;
    textareaDemoConfig: any;
    selectDemoConfig: any;
    multipleSelectDemoConfig: any;
    multipleSelect2DemoConfig: any;
    radioDemoConfig: any;
    toggleDemoConfig: any;
    checkboxDemoConfig: any;
    singleDateDemoConfig: any;
    multiDateDemoConfig: any;
    inputDemoConfig2: any;
    selectDemoconfig2: any;
    multipleSelectDemoConfig3: any;
    singleDateDemoConfig2: any;

    disabled: false = false;

    labelList = [
        {
            id: 1,
            label: "Option1",
        },
        {
            id: 2,
            label: "Option2",
        },
        {
            id: 3,
            label: "Option3",
        },
    ];

    addedLabelList = [];

    selectOptions = [
        {
            id: 1,
            label: "Option1",
        },
        {
            id: 2,
            label: "Option2",
        },
        {
            id: 3,
            label: "Option3",
        },
    ];

    radioOptions = [
        {
            id: 1,
            label: "Manual execution",
        },
        {
            id: 2,
            label: "Daily execution",
        },
        {
            id: 3,
            label: "Weekly execution",
        },
    ];

    checkboxOptions = [
        { id: "1", label: "Mon", checked: true },
        { id: "2", label: "Tue" },
        { id: "3", label: "Wed" },
        { id: "4", label: "Thur" },
        { id: "5", label: "Fri" },
        { id: "6", label: "Sat" },
        { id: "0", label: "Sun" },
    ];

    options2 = [
        {
            name: "Option 1",
            value: 1,
        },
        {
            name: "Option 2",
            value: 2,
        },
        {
            name: "Option 3",
            value: 3,
        },
        {
            name: "Option 4",
            value: 4,
        },
    ];
    currentOption4 = {};

    options = [
        {
            label: "option1",
            value: 1,
            children: [
                {
                    label: "option1-1",
                    value: 4,
                    children: [
                        {
                            label: "option1-1-1",
                            value: 8,
                            isLeaf: true,
                        },
                        {
                            label: "option1-1-2",
                            value: 9,
                            children: [
                                {
                                    label: "option1-1-2-1",
                                    value: 81,
                                    isLeaf: true,
                                },
                            ],
                        },
                    ],
                },
                {
                    label: "option1-2",
                    value: 41,
                    isLeaf: true,
                },
                {
                    label: "option1-3",
                    value: 42,
                    isLeaf: true,
                },
                {
                    label: "option1-4",
                    value: 43,
                    isLeaf: true,
                },
            ],
            icon: "icon-folder",
        },
        {
            label: "option2",
            value: 2,
            children: [
                {
                    label: "option2-1",
                    value: 5,
                    children: [
                        {
                            label: "option2-1-1",
                            value: 51,
                            isLeaf: true,
                        },
                        {
                            label: "option2-1-2",
                            value: 61,
                            isLeaf: true,
                            disabled: true,
                        },
                    ],
                },
                {
                    label: "option2-2",
                    value: 6,
                    children: [
                        {
                            label: "option2-2-1",
                            value: 512,
                            isLeaf: true,
                        },
                        {
                            label: "option2-2-2",
                            value: 611,
                            isLeaf: true,
                        },
                    ],
                },
                {
                    label: "option2-3",
                    value: 712,
                    isLeaf: true,
                },
            ],
            icon: "icon-folder",
        },
        {
            label: "option3",
            value: 3,
            children: [],
            isLeaf: true,
            disabled: true,
            icon: "icon-folder",
        },
    ];

    value1: Array<string | number>[] = [];
    value2: Array<string | number>[] = [
        [1, 4, 8],
        [1, 4, 9, 81],
        [1, 41],
    ];

    formData = {
        inputValue: "",
        textareaValue: "",
        selectValue: this.selectOptions[1],
        multipleSelectValue: [this.selectOptions[1], this.selectOptions[2]],
        multipleSelect2Value: [this.selectOptions[1], this.selectOptions[2]],
        radioValue: {},
        toggleValue: false,
        singDateValue: "",
        multiDateValue: {
            startDate: "",
            endDate: "",
        },

        inputValue2: "",
        singDateValue2: "",
    };

    selectedDate1 = new Date();

    // constructor() {}

    ngOnInit(): void {
        this.multipleSelect2DemoConfig = {
            key: "multipleSelect-demo2",
            label: "Options(Multiple selection with delete)",
            isSearch: true,
            multiple: "true",
            labelization: { enable: true, labelMaxWidth: "120px" },
            options: this.selectOptions,
        };
    }

    // onChanges(event: Event): void{    }
}
