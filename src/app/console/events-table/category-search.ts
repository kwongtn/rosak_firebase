export interface FilterOption {
    label: string;
    value: string;
}

export const statusOptions: FilterOption[] = [
    { label: "In Service", value: "IN_SERVICE" },
    { label: "Not in Service", value: "NOT_IN_SERVICE" },
    { label: "Decommissioned", value: "DECOMMISSIONED" },
    { label: "Testing", value: "TESTING" },
];

export const spottingTypeOptions: FilterOption[] = [
    { label: "Depot", value: "DEPOT" },
    { label: "Location", value: "LOCATION" },
    { label: "Between Stations", value: "BETWEEN_STATIONS" },
    { label: "Just Spotting", value: "JUST_SPOTTING" },
    { label: "At Station", value: "AT_STATION" },
];
