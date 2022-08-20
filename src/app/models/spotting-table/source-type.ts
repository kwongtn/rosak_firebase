import { VehicleStatusCountType } from "src/app/models/query/get-vehicles";

export interface SourceType {
    identificationNo: string;
    status: string;
    inServiceSince: string | null;
    lastSpotted: string;
    timesSpotted: number;
    notes: string;
    $expandConfig: boolean;
}

export interface TableDataType {
    displayName: string;
    vehicleStatusCount: VehicleStatusCountType;
    tableData: SourceType[];
}
