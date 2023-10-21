import { VehicleStatusCountType } from "src/app/models/query/get-vehicles";

interface ExpandConfig {
    expandable: boolean;
    expand: boolean;
}

export interface SourceType {
    id: string | number;
    identificationNo: string;
    status: string;
    inServiceSince: string | null;
    lastSpotted: string;
    timesSpotted: number;
    notes: string;
    $expandConfig: ExpandConfig;
}

export interface TableDataType {
    displayName: string;
    vehicleStatusCount: VehicleStatusCountType;
    tableData: SourceType[];
}
