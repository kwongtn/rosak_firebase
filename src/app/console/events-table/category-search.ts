import { ICategorySearchTagItem } from "ng-devui/category-search";

export const categoryData: ICategorySearchTagItem[] = [
    {
        label: "Status",
        field: "status",
        type: "checkbox",
        filterKey: "status",
        options: [
            {
                status: "In Service",
                value: "IN_SERVICE",
            },
            {
                status: "Not Spotted",
                value: "NOT_SPOTTED",
            },
            {
                status: "Decommissioned",
                value: "DECOMMISSIONED",
            },
            {
                status: "Testing",
                value: "TESTING",
            },
            {
                status: "Married",
                value: "UNKNOWN",
            },
            {
                status: "Unknown",
                value: "MARRIED",
            },
        ],
    },{
        label: "Spotting Type",
        field: "spottingType",
        type: "checkbox",
        options: [
            {
                label: "Depot",
                value: "DEPOT",
            },
            {
                label: "Location",
                value: "LOCATION",
            },
            {
                label: "Between Stations",
                value: "BETWEEN_STATIONS",
            },
            {
                label: "Just Spotting",
                value: "JUST_SPOTTING",
            },
            {
                label: "At Station",
                value: "AT_STATION",
            },
        ],
    },
    {
        label: "Created Time",
        field: "createdTime",
        type: "dateRange",
        showTime: true,
    },
    {
        label: "Spotted Date",
        field: "spottedDate",
        type: "dateRange",
        showTime: false,
    },
    {
        label: "Vehicle Status Different",
        field: "isVehicleStatusDifferent",
        type: "radio",
        options: [
            {
                label: "Yes",
                value: true,
            },
            {
                label: "No",
                value: false,
            },
        ],
    },
    {
        label: "Is Anonymous",
        field: "isAnonymous",
        type: "radio",
        options: [
            {
                label: "Yes",
                value: true,
            },
            {
                label: "No",
                value: false,
            },
        ],
    },
    {
        label: "Is Read",
        field: "isRead",
        type: "radio",
        options: [
            {
                label: "Yes",
                value: true,
            },
            {
                label: "No",
                value: false,
            },
        ],
    },
    {
        label: "Has Notes",
        field: "hasNotes",
        type: "radio",
        options: [
            {
                label: "Yes",
                value: true,
            },
            {
                label: "No",
                value: false,
            },
        ],
    },
];
