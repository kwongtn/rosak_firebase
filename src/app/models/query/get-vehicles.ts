import { SpottingType } from "../spotting-table/source-type";

export type VehicleStatus =
    | "IN_SERVICE"
    | "NOT_SPOTTED"
    | "DECOMMISSIONED"
    | "TESTING"
    | "UNKNOWN"
    | "MARRIED";

export interface VehicleStatusCountType {
    vehicleStatusDecommissionedCount: number;
    vehicleStatusInServiceCount: number;
    vehicleStatusNotSpottedCount: number;
    vehicleStatusTestingCount: number;
    vehicleStatusUnknownCount: number;
    vehicleStatusMarriedCount: number;
    vehicleTotalCount: number;
}

export interface VehicleType extends VehicleStatusCountType {
    id: string;
    internalName: string;
    displayName: string;
    vehicles: Array<{
        id: string;
        identificationNo: string;
        status: VehicleStatus;
        lastSpottingDate: string;
        inServiceSince: string;
        spottingCount: number;
        notes: string;
    }>;
}

export interface GetVehiclesReponse {
    vehicleTypes: Array<VehicleType>;
}

export interface GetLinesAndVehiclesResponse {
    lines: Array<{
        id: string;
        code: string;
        displayName: string;
        vehicleTypes: Array<VehicleType>;
    }>;
}

export interface GetLinesResponse {
    lines: Array<{
        id: string;
        code: string;
        displayName: string;
    }>;
}

export interface LastSpottings {
    spottingDate: string;
    status: VehicleStatus;
    type: SpottingType;
    notes: string;
}

export interface GetVehiclesLastSpottingResponse {
    vehicles: Array<{
        lastSpottings: Array<LastSpottings>;
    }>;
}
